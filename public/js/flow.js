document.addEventListener("DOMContentLoaded", () => {
    // --- STATE MANAGEMENT ---
    let state = {
        nodes: [],         // { id, type, x, y, name, username, password, folderLink, dbId, isNew }
        connections: [],   // { id, fromNodeId, toNodeId }
        pan: { x: 100, y: 100 },
        zoom: 0.5,
        hasUnsavedChanges: false,
        isPanning: false,
        dragStart: { x: 0, y: 0 },
        draggingNodeId: null,
        dragNodeOffset: { x: 0, y: 0 },
        connectingSourceId: null,
        activeTab: "flow",
        isDraggingLink: false,
        dragLinkSourceId: null,
        dragLinkTargetId: null,
        dragLinkStartScreen: { x: 0, y: 0 },
        newlyCreatedConnectionId: null,
        contextMenuTargetNodeId: null,
        contextMenuClickCanvasCoords: { x: 0, y: 0 }
    };

    // --- ELEMENT SELECTORS ---
    const canvasContainer = document.getElementById("flow-canvas-container");
    const canvas = document.getElementById("flow-canvas");
    const svgOverlay = document.getElementById("flow-svg");
    const addClientBtn = document.getElementById("flow-add-client-btn");
    const addGalleryBtn = document.getElementById("flow-add-gallery-btn");
    const deployBtn = document.getElementById("flow-deploy-btn");
    const refreshBtn = document.getElementById("flow-refresh-btn");
    const contextMenu = document.getElementById("flow-context-menu");

    // Zoom, Minimap, Search, Badge Elements
    const zoomInBtn = document.getElementById("flow-zoom-in-btn");
    const zoomOutBtn = document.getElementById("flow-zoom-out-btn");
    const zoomValBtn = document.getElementById("flow-zoom-value");
    const minimapContainer = document.getElementById("flow-minimap");
    const minimapViewport = document.getElementById("minimap-viewport");
    const searchNodeInput = document.getElementById("flow-node-search");
    const unsavedBadge = document.getElementById("flow-unsaved-badge");
    
    // Check if flow elements exist before continuing
    if (!canvasContainer || !canvas || !svgOverlay) return;

    // Helper functions from dashboard.js context
    const getAuthToken = () => localStorage.getItem("adminToken");
    const getHeaders = () => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
    });

    const triggerToast = (msg, type = "success") => {
        if (window.showToast) {
            window.showToast(msg, type);
        } else {
            console.log(`[Toast ${type}]: ${msg}`);
        }
    };

    // --- UNSAVED CHANGES TRACKING ---
    const setUnsavedChanges = (value) => {
        state.hasUnsavedChanges = value;
        if (unsavedBadge) {
            unsavedBadge.style.display = value ? "flex" : "none";
        }
    };

    const saveNodePositions = () => {
        let savedCoords = {};
        try {
            const stored = localStorage.getItem("flow_node_coords");
            if (stored) savedCoords = JSON.parse(stored);
        } catch (e) {}

        state.nodes.forEach(node => {
            if (node.dbId) {
                savedCoords[`${node.type}_${node.dbId}`] = { x: Math.round(node.x), y: Math.round(node.y) };
            }
        });

        try {
            localStorage.setItem("flow_node_coords", JSON.stringify(savedCoords));
        } catch (e) {
            console.error("Error saving flow_node_coords to localStorage:", e);
        }
    };

    // --- MINIMAP SYSTEM ---
    const updateMinimap = () => {
        if (!minimapContainer || !minimapViewport) return;
        
        const rect = canvasContainer.getBoundingClientRect();
        const containerWidth = rect.width || 1000;
        const containerHeight = rect.height || 620;
        
        const minimapWidth = 160;
        const minimapHeight = 160;
        const canvasSize = 4000;
        
        const mapScaleX = minimapWidth / canvasSize;
        const mapScaleY = minimapHeight / canvasSize;
        
        // Viewport bounds in canvas space
        const viewLeft = -state.pan.x / state.zoom;
        const viewTop = -state.pan.y / state.zoom;
        const viewWidth = containerWidth / state.zoom;
        const viewHeight = containerHeight / state.zoom;
        
        // Minimap bounds
        let x = viewLeft * mapScaleX;
        let y = viewTop * mapScaleY;
        let w = viewWidth * mapScaleX;
        let h = viewHeight * mapScaleY;
        
        // Clamp bounds
        if (x < 0) { w += x; x = 0; }
        if (y < 0) { h += y; y = 0; }
        if (x + w > minimapWidth) { w = minimapWidth - x; }
        if (y + h > minimapHeight) { h = minimapHeight - y; }
        
        minimapViewport.style.left = `${x}px`;
        minimapViewport.style.top = `${y}px`;
        minimapViewport.style.width = `${w}px`;
        minimapViewport.style.height = `${h}px`;
        
        // Render node dots
        minimapContainer.querySelectorAll(".minimap-dot").forEach(el => el.remove());
        state.nodes.forEach(node => {
            const dot = document.createElement("div");
            dot.className = `minimap-dot ${node.type}-dot`;
            dot.style.left = `${node.x * mapScaleX}px`;
            dot.style.top = `${node.y * mapScaleY}px`;
            minimapContainer.appendChild(dot);
        });
    };

    // --- CANVAS ZOOM & PAN MECHANICS ---
    const updateCanvasTransform = () => {
        canvas.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
        if (zoomValBtn) {
            zoomValBtn.textContent = `${Math.round(state.zoom * 100)}%`;
        }
        updateMinimap();
    };

    const centerCanvas = () => {
        const rect = canvasContainer.getBoundingClientRect();
        const width = rect.width || 1000;
        const height = rect.height || 620;
        state.pan = {
            x: Math.round((width / 2) - 2040 * state.zoom),
            y: Math.round((height / 2) - 1500 * state.zoom)
        };
        updateCanvasTransform();
    };

    // Initialize Pan with default values (will be centered on loadBoardData(true))
    state.pan = { x: -1540, y: -1190 };
    updateCanvasTransform();

    // Zoom Button Actions
    const zoomCentered = (zoomIn = true) => {
        const rect = canvasContainer.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const rx = (cx - state.pan.x) / state.zoom;
        const ry = (cy - state.pan.y) / state.zoom;
        
        const zoomFactor = 1.25;
        let newZoom = state.zoom;
        if (zoomIn) {
            newZoom = Math.min(2.0, state.zoom * zoomFactor);
        } else {
            newZoom = Math.max(0.3, state.zoom / zoomFactor);
        }
        
        state.pan.x = cx - rx * newZoom;
        state.pan.y = cy - ry * newZoom;
        state.zoom = newZoom;
        updateCanvasTransform();
        drawConnections();
    };

    if (zoomInBtn) {
        zoomInBtn.addEventListener("click", () => zoomCentered(true));
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener("click", () => zoomCentered(false));
    }
    if (zoomValBtn) {
        zoomValBtn.addEventListener("click", () => {
            const rect = canvasContainer.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const rx = (cx - state.pan.x) / state.zoom;
            const ry = (cy - state.pan.y) / state.zoom;
            
            state.zoom = 1.0;
            state.pan.x = cx - rx;
            state.pan.y = cy - ry;
            updateCanvasTransform();
            drawConnections();
        });
    }

    // Mouse Wheel Zoom centered on cursor
    canvasContainer.addEventListener("wheel", (e) => {
        e.preventDefault();
        const rect = canvasContainer.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        
        const rx = (cx - state.pan.x) / state.zoom;
        const ry = (cy - state.pan.y) / state.zoom;
        
        const zoomFactor = 1.1;
        let newZoom = state.zoom;
        if (e.deltaY < 0) {
            newZoom = Math.min(2.0, state.zoom * zoomFactor);
        } else {
            newZoom = Math.max(0.3, state.zoom / zoomFactor);
        }
        
        state.pan.x = cx - rx * newZoom;
        state.pan.y = cy - ry * newZoom;
        state.zoom = newZoom;
        
        updateCanvasTransform();
        drawConnections();
    }, { passive: false });

    // Minimap click-to-navigate
    const handleMinimapNavigation = (e) => {
        if (!minimapContainer) return;
        const minimapRect = minimapContainer.getBoundingClientRect();
        const mx = Math.max(0, Math.min(minimapRect.width, e.clientX - minimapRect.left));
        const my = Math.max(0, Math.min(minimapRect.height, e.clientY - minimapRect.top));
        
        const canvasX = mx * (4000 / minimapRect.width);
        const canvasY = my * (4000 / minimapRect.height);
        
        const rect = canvasContainer.getBoundingClientRect();
        state.pan.x = rect.width / 2 - canvasX * state.zoom;
        state.pan.y = rect.height / 2 - canvasY * state.zoom;
        
        updateCanvasTransform();
        drawConnections();
    };

    let isMinimapNavigating = false;
    if (minimapContainer) {
        minimapContainer.addEventListener("mousedown", (e) => {
            isMinimapNavigating = true;
            handleMinimapNavigation(e);
        });
    }

    canvasContainer.addEventListener("mousedown", (e) => {
        // Only pan if clicking direct canvas, not a node or input
        if (e.target === canvasContainer || e.target === canvas || e.target === svgOverlay) {
            state.isPanning = true;
            state.dragStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
            canvasContainer.style.cursor = "grabbing";
        }
    });

    document.addEventListener("mousemove", (e) => {
        // Minimap drag navigation
        if (isMinimapNavigating) {
            handleMinimapNavigation(e);
            return;
        }

        // 1. Handle Canvas Panning
        if (state.isPanning) {
            state.pan.x = e.clientX - state.dragStart.x;
            state.pan.y = e.clientY - state.dragStart.y;
            updateCanvasTransform();
            return;
        }

        // 2. Handle Node Dragging
        if (state.draggingNodeId) {
            const node = state.nodes.find(n => n.id === state.draggingNodeId);
            if (node) {
                const rect = canvasContainer.getBoundingClientRect();
                const mouseCanvasX = (e.clientX - rect.left - state.pan.x) / state.zoom;
                const mouseCanvasY = (e.clientY - rect.top - state.pan.y) / state.zoom;
                
                node.x = mouseCanvasX - state.dragNodeOffset.x;
                node.y = mouseCanvasY - state.dragNodeOffset.y;
                
                // Keep nodes within boundary limits of canvas
                node.x = Math.max(100, Math.min(3700, node.x));
                node.y = Math.max(100, Math.min(3700, node.y));

                const nodeEl = document.getElementById(node.id);
                if (nodeEl) {
                    nodeEl.style.left = `${node.x}px`;
                    nodeEl.style.top = `${node.y}px`;
                }
                drawConnections();
                updateMinimap();
                setUnsavedChanges(true);
            }
            return;
        }

        // 3. Handle Link Dragging
        if (state.isDraggingLink) {
            const dist = Math.hypot(e.clientX - state.dragLinkStartScreen.x, e.clientY - state.dragLinkStartScreen.y);
            if (dist > 5) {
                // Get mouse coordinates in canvas space, subtracting container offset and adjusting for zoom
                const rect = canvasContainer.getBoundingClientRect();
                let mouseX = (e.clientX - rect.left - state.pan.x) / state.zoom;
                let mouseY = (e.clientY - rect.top - state.pan.y) / state.zoom;
                
                const startPos = getConnectorCenter(state.dragLinkSourceId, "output");
                if (startPos) {
                    // Activate styles if they haven't been activated
                    const sourceNodeEl = document.getElementById(state.dragLinkSourceId);
                    if (sourceNodeEl) {
                        const outConnector = sourceNodeEl.querySelector(".output-connector");
                        if (outConnector && !outConnector.classList.contains("connecting-source")) {
                            outConnector.classList.add("connecting-source");
                            document.querySelectorAll(".input-connector").forEach(el => {
                                el.classList.add("connecting-active");
                            });
                        }
                    }

                    // Snapping logic: find if close to any gallery input connector
                    let snappedNodeId = null;
                    let minDistance = 50; // pixels in canvas space
                    
                    state.nodes.forEach(node => {
                        if (node.type === "gallery") {
                            const targetPos = getConnectorCenter(node.id, "input");
                            if (targetPos) {
                                const dx = mouseX - targetPos.x;
                                const dy = mouseY - targetPos.y;
                                const distance = Math.hypot(dx, dy);
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    snappedNodeId = node.id;
                                }
                            }
                        }
                    });

                    // Manage visual drag-hovered class on snapped connector
                    if (snappedNodeId !== state.dragLinkTargetId) {
                        if (state.dragLinkTargetId) {
                            const prevEl = document.getElementById(state.dragLinkTargetId);
                            if (prevEl) {
                                const conn = prevEl.querySelector(".input-connector");
                                if (conn) conn.classList.remove("drag-hovered");
                            }
                        }
                        
                        state.dragLinkTargetId = snappedNodeId;
                        
                        if (snappedNodeId) {
                            const nextEl = document.getElementById(snappedNodeId);
                            if (nextEl) {
                                const conn = nextEl.querySelector(".input-connector");
                                if (conn) conn.classList.add("drag-hovered");
                            }
                        }
                    }

                    // If snapped, make the curve snap to the exact target connector center
                    if (state.dragLinkTargetId) {
                        const targetPos = getConnectorCenter(state.dragLinkTargetId, "input");
                        if (targetPos) {
                            mouseX = targetPos.x;
                            mouseY = targetPos.y;
                        }
                    }

                    // Draw the temporary line on svgOverlay
                    let tempPath = document.getElementById("temp-drag-line");
                    if (!tempPath) {
                        tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        tempPath.id = "temp-drag-line";
                        tempPath.setAttribute("class", "temp-connection-line");
                        svgOverlay.appendChild(tempPath);
                    }
                    
                    const controlOffset = Math.max(100, Math.abs(mouseX - startPos.x) * 0.5);
                    const pathData = `M ${startPos.x} ${startPos.y} C ${startPos.x + controlOffset} ${startPos.y}, ${mouseX - controlOffset} ${mouseY}, ${mouseX} ${mouseY}`;
                    tempPath.setAttribute("d", pathData);
                }
            }
        }
    });

    document.addEventListener("mouseup", (e) => {
        isMinimapNavigating = false;
        
        if (state.isPanning) {
            state.isPanning = false;
            canvasContainer.style.cursor = "grab";
        }
        if (state.draggingNodeId) {
            saveNodePositions();
            state.draggingNodeId = null;
        }

        if (state.isDraggingLink) {
            const dist = Math.hypot(e.clientX - state.dragLinkStartScreen.x, e.clientY - state.dragLinkStartScreen.y);
            
            // If it is a drag drop action
            if (dist > 5) {
                if (state.dragLinkTargetId) {
                    const fromId = state.dragLinkSourceId;
                    const toId = state.dragLinkTargetId;

                    // Verify connection (from Client output to Gallery input)
                    const alreadyExists = state.connections.some(c => c.fromNodeId === fromId && c.toNodeId === toId);
                    if (!alreadyExists) {
                        const newConnId = `connection_${Date.now()}`;
                        state.connections.push({
                            id: newConnId,
                            fromNodeId: fromId,
                            toNodeId: toId
                        });
                        
                        // Success trigger & animations
                        state.newlyCreatedConnectionId = newConnId;
                        drawConnections();
                        triggerToast("Connection created!", "success");
                        setUnsavedChanges(true);
                        
                        // Clear success animation state after duration
                        setTimeout(() => {
                            if (state.newlyCreatedConnectionId === newConnId) {
                                state.newlyCreatedConnectionId = null;
                                const pathEl = document.getElementById(`path_${newConnId}`);
                                if (pathEl) {
                                    pathEl.classList.remove("newly-created");
                                }
                            }
                        }, 800);
                    } else {
                        triggerToast("This connection already exists.", "error");
                    }
                }
                
                // Clear any drag style classes and connection state
                resetConnectionState();
                
                // Remove the temp dragging path
                const tempPath = document.getElementById("temp-drag-line");
                if (tempPath) tempPath.remove();
                
                state.isDraggingLink = false;
            } else {
                // If it is a quick click (dist <= 5)
                // We keep click-to-connect state active, which triggers on the connector click listener
                // So we just clear the drag indicators and temp path
                const tempPath = document.getElementById("temp-drag-line");
                if (tempPath) tempPath.remove();
                
                state.isDraggingLink = false;
            }
        }
    });

    // --- TAB VISIBILITY SYNC ---
    // Make sure we redraw connection lines when tab changes
    const tabObservers = document.querySelectorAll(".tab-btn");
    tabObservers.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabName = btn.dataset.tab;
            state.activeTab = tabName;
            if (tabName === "flow") {
                // Brief timeout to let display render before calculations
                setTimeout(() => {
                    drawConnections();
                }, 100);
            }
        });
    });

    // --- NODE CREATION AND RENDERING ---
    const getCascadedPosition = (targetX, targetY) => {
        let x = targetX;
        let y = targetY;
        const offset = 30; // Shift by 30px x and y for cascading
        const threshold = 15; // Distance threshold to detect overlaps
        
        let foundCollision = true;
        while (foundCollision) {
            foundCollision = false;
            for (const node of state.nodes) {
                const distance = Math.hypot(node.x - x, node.y - y);
                if (distance < threshold) {
                    x += offset;
                    y += offset;
                    foundCollision = true;
                    break;
                }
            }
        }
        return { x, y };
    };

    const createNodeId = (type) => `${type}_node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const addClientNode = (name = "", username = "", password = "", dbId = null, x = 1650, y = 1500) => {
        const id = createNodeId("client");
        const node = {
            id,
            type: "client",
            x,
            y,
            name,
            username,
            password,
            dbId,
            isNew: !dbId
        };
        state.nodes.push(node);
        renderNode(node);
        drawConnections();
        return node;
    };

    const addGalleryNode = (name = "", folderLink = "", dbId = null, x = 2150, y = 1500) => {
        const id = createNodeId("gallery");
        const node = {
            id,
            type: "gallery",
            x,
            y,
            name,
            folderLink,
            dbId,
            isNew: !dbId
        };
        state.nodes.push(node);
        renderNode(node);
        drawConnections();
        return node;
    };

    const renderNode = (node) => {
        const nodeEl = document.createElement("div");
        nodeEl.className = `flow-node ${node.type}-node`;
        nodeEl.id = node.id;
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;

        const badgeText = node.isNew ? "New" : "DB";
        const badgeClass = node.isNew ? "new" : "db";
        const disabledAttr = node.isNew ? "" : "disabled";

        const iconClass = node.type === "client" ? "fa-user-tie" : "fa-images";
        const titleText = node.type === "client" ? (node.name || "New Client") : (node.name || "New Gallery");

        let bodyHTML = "";
        if (node.type === "client") {
            bodyHTML = `
                <div class="node-input-group">
                    <label>Client Name</label>
                    <input type="text" class="node-input-name" value="${node.name}" placeholder="e.g. Aravinth R" ${disabledAttr}>
                </div>
                <div class="node-input-group">
                    <label>Username</label>
                    <input type="text" class="node-input-username" value="${node.username}" placeholder="e.g. aravinth" ${disabledAttr}>
                </div>
                ${node.isNew ? `
                <div class="node-input-group">
                    <label>Password</label>
                    <input type="password" class="node-input-password" value="${node.password}" placeholder="Create password">
                </div>` : ''}
            `;
        } else {
            bodyHTML = `
                <div class="node-input-group">
                    <label>Gallery Name</label>
                    <input type="text" class="node-input-name" value="${node.name}" placeholder="e.g. Wedding Shoot" ${disabledAttr}>
                </div>
                <div class="node-input-group">
                    <label>Google Drive Link/ID</label>
                    <input type="text" class="node-input-folder" value="${node.folderLink}" placeholder="Paste URL or ID" ${disabledAttr}>
                </div>
            `;
        }

        nodeEl.innerHTML = `
            <div class="node-header" id="header_${node.id}">
                <div class="node-title-group">
                    <i class="fas ${iconClass}"></i>
                    <span class="node-title">${titleText}</span>
                </div>
                <div class="node-actions-group">
                    <span class="node-badge ${badgeClass}">${badgeText}</span>
                    <button class="node-delete-btn" title="Delete Node"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
            <div class="node-body">
                ${bodyHTML}
            </div>
            <!-- Connector Handles -->
            ${node.type === "client" 
                ? `<div class="node-connector output-connector" data-connector-type="output" data-node-id="${node.id}" title="Assign Gallery"></div>` 
                : `<div class="node-connector input-connector" data-connector-type="input" data-node-id="${node.id}" title="Receive Assignment"></div>`
            }
        `;

        canvas.appendChild(nodeEl);

        // --- ATTACH DRAG & INTERACTION HANDLERS ---
        const header = nodeEl.querySelector(".node-header");
        header.addEventListener("mousedown", (e) => {
            if (e.target.closest(".node-delete-btn")) return; // Don't drag on delete click
            state.draggingNodeId = node.id;
            const rect = canvasContainer.getBoundingClientRect();
            const mouseCanvasX = (e.clientX - rect.left - state.pan.x) / state.zoom;
            const mouseCanvasY = (e.clientY - rect.top - state.pan.y) / state.zoom;
            state.dragNodeOffset = {
                x: mouseCanvasX - node.x,
                y: mouseCanvasY - node.y
            };
            // Bring dragged node to front
            nodeEl.style.zIndex = Math.max(...state.nodes.map(n => {
                const el = document.getElementById(n.id);
                return el ? parseInt(el.style.zIndex || 5) : 5;
            })) + 1;
        });

        // Form inputs updates state
        const nameInput = nodeEl.querySelector(".node-input-name");
        if (nameInput) {
            nameInput.addEventListener("input", (e) => {
                node.name = e.target.value;
                nodeEl.querySelector(".node-title").textContent = e.target.value || (node.type === "client" ? "New Client" : "New Gallery");
                setUnsavedChanges(true);
                updateMinimap();
            });
        }

        const usernameInput = nodeEl.querySelector(".node-input-username");
        if (usernameInput) {
            usernameInput.addEventListener("input", (e) => {
                node.username = e.target.value;
                setUnsavedChanges(true);
                updateMinimap();
            });
        }

        const passwordInput = nodeEl.querySelector(".node-input-password");
        if (passwordInput) {
            passwordInput.addEventListener("input", (e) => {
                node.password = e.target.value;
                setUnsavedChanges(true);
            });
        }

        const folderInput = nodeEl.querySelector(".node-input-folder");
        if (folderInput) {
            folderInput.addEventListener("input", (e) => {
                node.folderLink = e.target.value;
                setUnsavedChanges(true);
                updateMinimap();
            });
        }

        // Delete Button Action
        const deleteBtn = nodeEl.querySelector(".node-delete-btn");
        deleteBtn.addEventListener("click", () => {
            handleDeleteNode(node);
        });

        // Connector Handle Interaction Logic (supports click-to-connect and drag-to-connect)
        const connector = nodeEl.querySelector(".node-connector");
        connector.addEventListener("mousedown", (e) => {
            const type = connector.dataset.connectorType;
            if (type === "output") {
                e.stopPropagation();
                e.preventDefault();
                state.isDraggingLink = true;
                state.dragLinkSourceId = node.id;
                state.dragLinkStartScreen = { x: e.clientX, y: e.clientY };
                state.dragLinkTargetId = null;
            }
        });

        connector.addEventListener("click", (e) => {
            e.stopPropagation();
            handleConnectorClick(connector);
        });
    };

    // --- CONNECTION HANDLING ---
    const handleConnectorClick = (connectorEl) => {
        const type = connectorEl.dataset.connectorType;
        const nodeId = connectorEl.dataset.nodeId;

        // Click Output handle first
        if (type === "output") {
            // Cancel connection if clicking again
            if (state.connectingSourceId === nodeId) {
                resetConnectionState();
                return;
            }
            resetConnectionState();
            state.connectingSourceId = nodeId;
            connectorEl.classList.add("connecting-source");
            
            // Pulse input handles to show they are valid targets
            document.querySelectorAll(".input-connector").forEach(el => {
                el.classList.add("connecting-active");
            });
        } 
        // Click Input handle second
        else if (type === "input" && state.connectingSourceId) {
            // Verify connection (from Client output to Gallery input)
            const fromId = state.connectingSourceId;
            const toId = nodeId;

            // Check if connection already exists
            const alreadyExists = state.connections.some(c => c.fromNodeId === fromId && c.toNodeId === toId);
            if (!alreadyExists) {
                state.connections.push({
                    id: `connection_${Date.now()}`,
                    fromNodeId: fromId,
                    toNodeId: toId
                });
                drawConnections();
                triggerToast("Connection created!", "success");
                setUnsavedChanges(true);
            } else {
                triggerToast("This connection already exists.", "error");
            }
            resetConnectionState();
        }
    };

    const resetConnectionState = () => {
        state.connectingSourceId = null;
        document.querySelectorAll(".node-connector").forEach(el => {
            el.classList.remove("connecting-source", "connecting-active", "drag-hovered");
        });
    };

    // Click anywhere on canvas container cancels current connection sequence
    canvasContainer.addEventListener("click", () => {
        resetConnectionState();
    });

    const getConnectorCenter = (nodeId, type) => {
        const nodeEl = document.getElementById(nodeId);
        if (!nodeEl) return null;
        const connector = nodeEl.querySelector(`.${type}-connector`);
        if (!connector) return null;
        
        return {
            x: nodeEl.offsetLeft + connector.offsetLeft + (connector.offsetWidth / 2),
            y: nodeEl.offsetTop + connector.offsetTop + (connector.offsetHeight / 2)
        };
    };

    // --- DRAWING BEZIER CONNECTIONS ---
    const drawConnections = () => {
        // Clear SVG Overlay
        svgOverlay.innerHTML = "";

        if (state.activeTab !== "flow") return;

        state.connections.forEach(conn => {
            const fromNode = state.nodes.find(n => n.id === conn.fromNodeId);
            const toNode = state.nodes.find(n => n.id === conn.toNodeId);

            if (!fromNode || !toNode) return;

            const fromPos = getConnectorCenter(fromNode.id, "output");
            const toPos = getConnectorCenter(toNode.id, "input");

            if (!fromPos || !toPos) return;

            const fromX = fromPos.x;
            const fromY = fromPos.y;
            const toX = toPos.x;
            const toY = toPos.y;

            // Create n8n-style cubic bezier curve: M x1 y1 C x1+100 y1, x2-100 y2, x2 y2
            const controlOffset = Math.max(100, Math.abs(toX - fromX) * 0.5);
            const pathData = `M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`;

            // Create background hoverable line for easier clicking
            const pathBg = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathBg.setAttribute("d", pathData);
            pathBg.setAttribute("class", "connection-line-bg");
            
            // Delete link on line click
            pathBg.addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm("Disconnect this assignment?")) {
                    state.connections = state.connections.filter(c => c.id !== conn.id);
                    drawConnections();
                    triggerToast("Assignment disconnected.", "success");
                    setUnsavedChanges(true);
                    updateMinimap();
                }
            });

            // Add highlight hover effect to visual path when hovering background path
            pathBg.addEventListener("mouseenter", () => {
                pathBg.classList.add("hovered");
            });
            pathBg.addEventListener("mouseleave", () => {
                pathBg.classList.remove("hovered");
            });

            // Create actual visual line
            const pathLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathLine.id = `path_${conn.id}`;
            pathLine.setAttribute("d", pathData);
            
            let classes = "connection-line";
            if (state.newlyCreatedConnectionId === conn.id) {
                classes += " newly-created";
            }
            pathLine.setAttribute("class", classes);

            svgOverlay.appendChild(pathBg);
            svgOverlay.appendChild(pathLine);
        });
    };

    // --- NODE DELETION ---
    const handleDeleteNode = async (node) => {
        if (!node.isNew) {
            // Database Node needs confirmation and API deletion call
            const confirmMsg = `Are you sure you want to permanently delete this ${node.type} from the database? This cannot be undone.`;
            if (!confirm(confirmMsg)) return;

            try {
                const endpointType = node.type === "gallery" ? "galleries" : `${node.type}s`;
                const url = `/api/${endpointType}/${node.dbId}`;
                const res = await fetch(url, {
                    method: "DELETE",
                    headers: getHeaders(),
                });
                
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.message || "Failed to delete.");
                }

                // Remove node from localStorage coords
                if (node.dbId) {
                    try {
                        const stored = localStorage.getItem("flow_node_coords");
                        if (stored) {
                            const coords = JSON.parse(stored);
                            delete coords[`${node.type}_${node.dbId}`];
                            localStorage.setItem("flow_node_coords", JSON.stringify(coords));
                        }
                    } catch (e) {}
                }

                triggerToast(`Successfully deleted ${node.type} from database.`, "success");
                
                // Refresh local dashboard lists if dashboard.js functions exist
                if (window.refreshDashboardData) {
                    await window.refreshDashboardData();
                }
            } catch (err) {
                triggerToast(err.message, "error");
                return;
            }
        }

        // Remove node and all connected lines from UI state
        state.nodes = state.nodes.filter(n => n.id !== node.id);
        state.connections = state.connections.filter(c => c.fromNodeId !== node.id && c.toNodeId !== node.id);
        
        const el = document.getElementById(node.id);
        if (el) el.remove();
        
        drawConnections();
        updateMinimap();
        setUnsavedChanges(true);
    };

    // --- LOAD BOARD DATA FROM BACKEND ---
    const loadBoardData = async (resetPan = false) => {
        const loader = document.getElementById("flow-loader");
        if (loader) loader.classList.add("show");

        // Clear canvas
        canvas.querySelectorAll(".flow-node").forEach(el => el.remove());
        svgOverlay.innerHTML = "";
        state.nodes = [];
        state.connections = [];

        try {
            // Fetch galleries and clients from backend
            const [galleriesRes, clientsRes] = await Promise.all([
                fetch("/api/galleries?limit=1000", { headers: getHeaders() }),
                fetch("/api/clients?limit=1000", { headers: getHeaders() })
            ]);

            if (!galleriesRes.ok || !clientsRes.ok) throw new Error("Failed to load setup board data.");

            const galleriesData = (await galleriesRes.json()).data;
            const clientsData = (await clientsRes.json()).data;

            // Load saved node positions from localStorage
            let savedCoords = {};
            try {
                const stored = localStorage.getItem("flow_node_coords");
                if (stored) savedCoords = JSON.parse(stored);
            } catch (e) {
                console.error("Error reading flow_node_coords from localStorage:", e);
            }

            // Grid Layout Algorithm (Arrange clients in Left Column, Galleries in Right Column)
            let clientY = 1500;
            let galleryY = 1500;

            const clientNodeMap = {}; // dbId -> flowNodeId
            const galleryNodeMap = {}; // dbId -> flowNodeId

            // Render Client Nodes
            clientsData.forEach(c => {
                const saved = savedCoords[`client_${c.id}`];
                const x = saved ? saved.x : 1650;
                const y = saved ? saved.y : clientY;
                const node = addClientNode(c.name, c.username, "", c.id, x, y);
                clientNodeMap[c.id] = node.id;
                if (!saved) clientY += 180;
            });

            // Render Gallery Nodes
            galleriesData.forEach(g => {
                // Construct standard link for display from folderId
                const link = `https://drive.google.com/drive/u/0/folders/${g.folderId}`;
                const saved = savedCoords[`gallery_${g.id}`];
                const x = saved ? saved.x : 2150;
                const y = saved ? saved.y : galleryY;
                const node = addGalleryNode(g.name, link, g.id, x, y);
                galleryNodeMap[g.id] = node.id;
                if (!saved) galleryY += 160;
            });

            // Build Connections based on existing database assignments
            clientsData.forEach(c => {
                const fromNodeId = clientNodeMap[c.id];
                if (fromNodeId && c.galleryIds) {
                    c.galleryIds.forEach(gid => {
                        const toNodeId = galleryNodeMap[gid];
                        if (toNodeId) {
                            state.connections.push({
                                id: `connection_${c.id}_${gid}`,
                                fromNodeId,
                                toNodeId
                            });
                        }
                    });
                }
            });

            if (resetPan) {
                centerCanvas();
            }
            
            // Always delay connection drawing and minimap rendering to let DOM layout settle
            setTimeout(() => {
                drawConnections();
                updateMinimap();
            }, 60);

            setUnsavedChanges(false);
        } catch (err) {
            console.error(err);
            triggerToast("Error loading workflow flowboard data.", "error");
        } finally {
            if (loader) loader.classList.remove("show");
        }
    };

    // --- DEPLOY BOARD SYSTEM ---
    const deployFlow = async () => {
        const deployBtnText = deployBtn.querySelector("span") || deployBtn;
        const originalHTML = deployBtn.innerHTML;
        
        deployBtn.disabled = true;
        deployBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Deploying...`;

        try {
            // 1. Process New Clients
            const newClientNodes = state.nodes.filter(n => n.type === "client" && n.isNew);
            for (const cNode of newClientNodes) {
                if (!cNode.name.trim() || !cNode.username.trim() || !cNode.password.trim()) {
                    throw new Error("All new client fields (Name, Username, Password) must be completed.");
                }

                const res = await fetch("/api/clients", {
                    method: "POST",
                    headers: getHeaders(),
                    body: JSON.stringify({
                        name: cNode.name.trim(),
                        username: cNode.username.trim(),
                        password: cNode.password.trim()
                    })
                });

                const resData = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(`Client creation failed for '${cNode.name}': ${resData.message || res.statusText}`);
                }

                if (!resData.data || !resData.data.id) {
                    throw new Error("Could not retrieve created client ID from server.");
                }
                cNode.dbId = resData.data.id;
                cNode.isNew = false;
            }

            // 2. Process New Galleries
            const newGalleryNodes = state.nodes.filter(n => n.type === "gallery" && n.isNew);
            for (const gNode of newGalleryNodes) {
                if (!gNode.name.trim() || !gNode.folderLink.trim()) {
                    throw new Error("All new gallery fields (Name, Drive link) must be completed.");
                }

                const res = await fetch("/api/galleries", {
                    method: "POST",
                    headers: getHeaders(),
                    body: JSON.stringify({
                        name: gNode.name.trim(),
                        folderLink: gNode.folderLink.trim()
                    })
                });

                const resData = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(`Gallery creation failed for '${gNode.name}': ${resData.message || res.statusText}`);
                }

                if (!resData.data || !resData.data.id) {
                    throw new Error("Could not retrieve created gallery ID from server.");
                }
                gNode.dbId = resData.data.id;
                gNode.isNew = false;
            }

            // 3. Process Assignments
            // Group connections by client dbId -> list of gallery dbIds
            const assignmentMap = {}; // clientDbId -> Array of galleryDbIds
            
            // Get all database client nodes
            const clientNodes = state.nodes.filter(n => n.type === "client");
            clientNodes.forEach(c => {
                assignmentMap[c.dbId] = [];
            });

            // Map connections to assignments
            state.connections.forEach(conn => {
                const fromNode = state.nodes.find(n => n.id === conn.fromNodeId);
                const toNode = state.nodes.find(n => n.id === conn.toNodeId);
                
                if (fromNode && toNode && fromNode.dbId && toNode.dbId) {
                    if (!assignmentMap[fromNode.dbId]) assignmentMap[fromNode.dbId] = [];
                    assignmentMap[fromNode.dbId].push(toNode.dbId);
                }
            });

            // Dispatch assignments sequentially
            for (const clientId of Object.keys(assignmentMap)) {
                const galleryIds = assignmentMap[clientId];
                const res = await fetch(`/api/clients/${clientId}/assign`, {
                    method: "PUT",
                    headers: getHeaders(),
                    body: JSON.stringify({ galleryIds })
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(`Assignments update failed: ${err.message || res.statusText}`);
                }
            }

            saveNodePositions();
            triggerToast("Workflow board deployed and saved successfully!", "success");
            setUnsavedChanges(false);
            
            // Reload dashboard tables if dashboard.js functions exist
            if (window.refreshDashboardData) {
                await window.refreshDashboardData();
            }

            // Reload visual board to synchronize clean database states
            await loadBoardData();
        } catch (err) {
            console.error(err);
            triggerToast(err.message, "error");
        } finally {
            deployBtn.disabled = false;
            deployBtn.innerHTML = originalHTML;
        }
    };

    // --- VIEWPORT CENTER COORDINATES HELPER ---
    const getViewportCenterCanvasCoords = () => {
        const rect = canvasContainer.getBoundingClientRect();
        const width = rect.width || 1000;
        const height = rect.height || 620;
        return {
            x: Math.round((-state.pan.x + (width / 2)) / state.zoom),
            y: Math.round((-state.pan.y + (height / 2)) / state.zoom)
        };
    };

    // --- TOOLBAR BUTTON ACTIONS ---
    addClientBtn.addEventListener("click", () => {
        const center = getViewportCenterCanvasCoords();
        const targetPos = getCascadedPosition(center.x - 140, center.y - 75);
        addClientNode("", "", "", null, targetPos.x, targetPos.y);
        triggerToast("New client node added to canvas.", "success");
        setUnsavedChanges(true);
        updateMinimap();
    });

    addGalleryBtn.addEventListener("click", () => {
        const center = getViewportCenterCanvasCoords();
        const targetPos = getCascadedPosition(center.x - 140, center.y - 75);
        addGalleryNode("", "", null, targetPos.x, targetPos.y);
        triggerToast("New gallery node added to canvas.", "success");
        setUnsavedChanges(true);
        updateMinimap();
    });

    refreshBtn.addEventListener("click", () => {
        if (confirm("Reset layout positions and reload live database entities? All unsaved node configurations will be lost.")) {
            loadBoardData(true);
        }
    });

    deployBtn.addEventListener("click", () => {
        deployFlow();
    });

    // --- CUSTOM CONTEXT MENU MECHANICS ---
    const showContextMenu = (e, isNode, nodeId = null) => {
        e.preventDefault();
        
        // Target tracking
        state.contextMenuTargetNodeId = nodeId;
        
        const rect = canvasContainer.getBoundingClientRect();
        state.contextMenuClickCanvasCoords = {
            x: (e.clientX - rect.left - state.pan.x) / state.zoom,
            y: (e.clientY - rect.top - state.pan.y) / state.zoom
        };

        // Toggle visibility of menu items depending on context
        const addClientItem = document.getElementById("ctx-add-client");
        const addGalleryItem = document.getElementById("ctx-add-gallery");
        const deleteNodeItem = document.getElementById("ctx-delete-node");

        if (isNode) {
            if (addClientItem) addClientItem.style.display = "none";
            if (addGalleryItem) addGalleryItem.style.display = "none";
            if (deleteNodeItem) deleteNodeItem.style.display = "flex";
        } else {
            if (addClientItem) addClientItem.style.display = "flex";
            if (addGalleryItem) addGalleryItem.style.display = "flex";
            if (deleteNodeItem) deleteNodeItem.style.display = "none";
        }

        // Set position & prevent viewport clipping
        let menuX = e.clientX;
        let menuY = e.clientY;
        const menuWidth = 190;
        const menuHeight = isNode ? 50 : 90; // approximate heights

        if (menuX + menuWidth > window.innerWidth) {
            menuX = window.innerWidth - menuWidth - 10;
        }
        if (menuY + menuHeight > window.innerHeight) {
            menuY = window.innerHeight - menuHeight - 10;
        }

        contextMenu.style.left = `${menuX}px`;
        contextMenu.style.top = `${menuY}px`;
        contextMenu.style.display = "block";
        
        // Trigger reflow for animations
        void contextMenu.offsetWidth;
        contextMenu.classList.add("active");
    };

    const hideContextMenu = () => {
        if (!contextMenu) return;
        contextMenu.classList.remove("active");
        setTimeout(() => {
            if (!contextMenu.classList.contains("active")) {
                contextMenu.style.display = "none";
            }
        }, 120);
    };

    // Right-click listener on Canvas Container
    canvasContainer.addEventListener("contextmenu", (e) => {
        // If clicking on an input or select inside a node, allow standard context menu
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") {
            return;
        }
        
        // Find if right clicked on a node
        const nodeEl = e.target.closest(".flow-node");
        if (nodeEl) {
            showContextMenu(e, true, nodeEl.id);
        } else if (e.target === canvasContainer || e.target === canvas || e.target === svgOverlay) {
            showContextMenu(e, false);
        }
    });

    // Close menu when clicking outside
    document.addEventListener("mousedown", (e) => {
        if (contextMenu && !e.target.closest("#flow-context-menu")) {
            hideContextMenu();
        }
    });

    // Close menu on key escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            hideContextMenu();
        }
    });

    // Close menu on zoom/pan or when starting dragging
    canvasContainer.addEventListener("mousedown", (e) => {
        hideContextMenu();
    });

    // Bind Context Menu Actions
    const ctxAddClient = document.getElementById("ctx-add-client");
    if (ctxAddClient) {
        ctxAddClient.addEventListener("click", () => {
            const coords = state.contextMenuClickCanvasCoords;
            const targetPos = getCascadedPosition(coords.x - 140, coords.y - 75);
            addClientNode("", "", "", null, targetPos.x, targetPos.y);
            triggerToast("New client node added to canvas.", "success");
            setUnsavedChanges(true);
            updateMinimap();
            hideContextMenu();
        });
    }

    const ctxAddGallery = document.getElementById("ctx-add-gallery");
    if (ctxAddGallery) {
        ctxAddGallery.addEventListener("click", () => {
            const coords = state.contextMenuClickCanvasCoords;
            const targetPos = getCascadedPosition(coords.x - 140, coords.y - 75);
            addGalleryNode("", "", null, targetPos.x, targetPos.y);
            triggerToast("New gallery node added to canvas.", "success");
            setUnsavedChanges(true);
            updateMinimap();
            hideContextMenu();
        });
    }

    const ctxDeleteNode = document.getElementById("ctx-delete-node");
    if (ctxDeleteNode) {
        ctxDeleteNode.addEventListener("click", () => {
            if (state.contextMenuTargetNodeId) {
                const node = state.nodes.find(n => n.id === state.contextMenuTargetNodeId);
                if (node) {
                    handleDeleteNode(node);
                }
            }
            hideContextMenu();
        });
    }

    // --- SEARCH / FILTER NODE FUNCTION {AUTO-CENTER} ---
    if (searchNodeInput) {
        searchNodeInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            // Clear highlights first
            document.querySelectorAll(".flow-node").forEach(el => el.classList.remove("highlighted"));
            
            if (!query) return;
            
            // Find nodes matching query (name or username)
            const matched = state.nodes.filter(node => 
                (node.name && node.name.toLowerCase().includes(query)) ||
                (node.username && node.username.toLowerCase().includes(query))
            );
            
            matched.forEach((node, idx) => {
                const el = document.getElementById(node.id);
                if (el) {
                    el.classList.add("highlighted");
                    
                    // Auto-center canvas on the FIRST match
                    if (idx === 0) {
                        const rect = canvasContainer.getBoundingClientRect();
                        const width = rect.width || 1000;
                        const height = rect.height || 620;
                        
                        // Center on node.x, node.y (node width is 280, approx height is 150)
                        state.pan.x = (width / 2) - (node.x + 140) * state.zoom;
                        state.pan.y = (height / 2) - (node.y + 75) * state.zoom;
                        
                        updateCanvasTransform();
                        drawConnections();
                    }
                }
            });
        });
    }

    // Initial Load on dashboard launch
    // Wait until adminToken is verified
    const initTimer = setInterval(() => {
        if (localStorage.getItem("adminToken")) {
            loadBoardData(true);
            clearInterval(initTimer);
        }
    }, 500);

    // Stop checking after 10 seconds if token isn't loaded
    setTimeout(() => clearInterval(initTimer), 10000);
});
