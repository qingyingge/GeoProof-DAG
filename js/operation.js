// GeoProof-DAG 编辑器核心逻辑 (最终版)
(function(){
    // ---------- 数据结构 ----------
    let nodes = [];
    let edges = [];
    let nextNodeId = 1;
    let nextEdgeId = 1;

    const NODE_W = 110;
    const NODE_H = 52;

    // 拖拽系统
    let dragState = {
        active: false,
        node: null,
        startX: 0, startY: 0,
        offsetX: 0, offsetY: 0,
        moved: false
    };

    // 添加边暂存起点
    let pendingSourceNode = null;

    // 当前选中的元素 (用于详情面板)
    let currentSelectedElement = null;   // { type: 'node', data: node } 或 { type: 'edge', data: edge }

    // DOM 元素
    const canvas = document.getElementById('dagCanvas');
    const ctx = canvas.getContext('2d');
    const statusSpan = document.getElementById('globalStatus');
    const modalOverlay = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const nodeSpecificDiv = document.getElementById('nodeSpecificFields');
    const nodeContentInput = document.getElementById('nodeContentInput');
    const commentInput = document.getElementById('commentInput');
    const saveBtn = document.getElementById('saveModalBtn');
    const cancelBtn = document.getElementById('cancelModalBtn');
    const deleteBtn = document.getElementById('deleteItemBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');

    // ---------- 辅助函数 ----------
    function updateStatus(msg, isError = false) {
        if (!statusSpan) return;
        statusSpan.innerText = msg;
        statusSpan.style.color = isError ? '#b91c1c' : '#1e40af';
        setTimeout(() => {
            if(statusSpan.innerText === msg) statusSpan.innerText = '⚡ 就绪';
            statusSpan.style.color = '#1e40af';
        }, 1500);
    }

    // 环检测
    function wouldCreateCycle(fromId, toId) {
        if(fromId === toId) return true;
        const adj = new Map();
        nodes.forEach(node => adj.set(node.id, []));
        edges.forEach(edge => adj.get(edge.fromId).push(edge.toId));
        adj.get(fromId).push(toId);
        function isReachable(src, target) {
            if(src === target) return true;
            const visited = new Set();
            const stack = [src];
            while(stack.length) {
                const current = stack.pop();
                if(current === target) return true;
                if(visited.has(current)) continue;
                visited.add(current);
                const neighbors = adj.get(current) || [];
                for(const nb of neighbors) if(!visited.has(nb)) stack.push(nb);
            }
            return false;
        }
        return isReachable(toId, fromId);
    }

    function addEdge(fromId, toId, comment = '') {
        if(!fromId || !toId) return false;
        if(fromId === toId) { updateStatus('不能添加自环边', true); return false; }
        const exists = edges.some(e => e.fromId === fromId && e.toId === toId);
        if(exists) { updateStatus('边已存在', true); return false; }
        if(wouldCreateCycle(fromId, toId)) { updateStatus('❌ 添加此边会形成环路', true); return false; }
        const newEdge = { id: nextEdgeId++, fromId, toId, text: comment || '' };
        edges.push(newEdge);
        drawCanvas();
        updateStatus(`✔️ 添加边 ${fromId} → ${toId}`);
        return true;
    }

    function addNodeAt(x, y, text = null, comment = '') {
        const defaultName = text || `节点${nextNodeId}`;
        const newNode = {
            id: nextNodeId++,
            text: defaultName,
            comment: comment || '',
            x: x - NODE_W/2,
            y: y - NODE_H/2,
            width: NODE_W,
            height: NODE_H
        };
        nodes.push(newNode);
        drawCanvas();
        updateStatus(`➕ 添加节点 “${newNode.text}”`);
        return newNode;
    }

    function deleteNodeById(nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if(!node) return;
        if(confirm(`确定要删除节点“${node.text}”及其所有关联边吗？`)) {
            edges = edges.filter(e => e.fromId !== nodeId && e.toId !== nodeId);
            nodes = nodes.filter(n => n.id !== nodeId);
            if(pendingSourceNode && pendingSourceNode.id === nodeId) pendingSourceNode = null;
            drawCanvas();
            updateStatus(`🗑️ 已删除节点 ${node.text}`);
            closeModal();
        }
    }

    function deleteEdgeById(edgeId) {
        const edge = edges.find(e => e.id === edgeId);
        if(!edge) return;
        if(confirm(`确定要删除这条边吗？`)) {
            edges = edges.filter(e => e.id !== edgeId);
            drawCanvas();
            updateStatus(`✂️ 已删除边`);
            closeModal();
        }
    }

    function updateNode(nodeId, newText, newComment) {
        const node = nodes.find(n => n.id === nodeId);
        if(node) {
            node.text = newText.trim() || `节点${node.id}`;
            node.comment = newComment;
            drawCanvas();
            updateStatus(`💾 节点已更新`);
        }
    }

    function updateEdge(edgeId, newComment) {
        const edge = edges.find(e => e.id === edgeId);
        if(edge) {
            edge.text = newComment;
            drawCanvas();
            updateStatus(`💾 边注释已更新`);
        }
    }

    // 绘制几何
    function drawStadium(ctx, x, y, w, h, fillColor, strokeColor, text, highlight=false) {
        const radius = h / 2;
        ctx.beginPath();
        ctx.arc(x + radius, y + radius, radius, Math.PI/2, 3*Math.PI/2);
        ctx.arc(x + w - radius, y + radius, radius, -Math.PI/2, Math.PI/2);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = highlight ? '#f59e0b' : strokeColor;
        ctx.lineWidth = highlight ? 3 : 2;
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.font = `500 14px "Segoe UI", system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let displayText = text;
        if(ctx.measureText(displayText).width > w - 20) {
            while(ctx.measureText(displayText + '...').width > w - 20 && displayText.length > 0) displayText = displayText.slice(0, -1);
            displayText += '...';
        }
        ctx.fillText(displayText, x + w/2, y + h/2);
    }

    function getIntersectionPoint(node, fromX, fromY, toX, toY) {
        const left = node.x, right = node.x + node.width, top = node.y, bottom = node.y + node.height;
        const dx = toX - fromX, dy = toY - fromY;
        if(dx === 0 && dy === 0) return {x: node.x + node.width/2, y: node.y + node.height/2};
        let tmin = 1;
        if(dx !== 0) {
            let t = (left - fromX) / dx;
            if(t >= 0 && t <= 1) { let y = fromY + dy * t; if(y >= top && y <= bottom && t < tmin) tmin = t; }
            t = (right - fromX) / dx;
            if(t >= 0 && t <= 1) { let y = fromY + dy * t; if(y >= top && y <= bottom && t < tmin) tmin = t; }
        }
        if(dy !== 0) {
            let t = (top - fromY) / dy;
            if(t >= 0 && t <= 1) { let x = fromX + dx * t; if(x >= left && x <= right && t < tmin) tmin = t; }
            t = (bottom - fromY) / dy;
            if(t >= 0 && t <= 1) { let x = fromX + dx * t; if(x >= left && x <= right && t < tmin) tmin = t; }
        }
        return { x: fromX + dx * tmin, y: fromY + dy * tmin };
    }

    function drawArrowEdge(edge) {
        const fromNode = nodes.find(n => n.id === edge.fromId);
        const toNode = nodes.find(n => n.id === edge.toId);
        if(!fromNode || !toNode) return;
        const startCenter = { x: fromNode.x + fromNode.width/2, y: fromNode.y + fromNode.height/2 };
        const endCenter = { x: toNode.x + toNode.width/2, y: toNode.y + toNode.height/2 };
        const startPt = getIntersectionPoint(fromNode, endCenter.x, endCenter.y, startCenter.x, startCenter.y);
        const endPt = getIntersectionPoint(toNode, startCenter.x, startCenter.y, endCenter.x, endCenter.y);
        ctx.beginPath();
        ctx.moveTo(startPt.x, startPt.y);
        ctx.lineTo(endPt.x, endPt.y);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        const angle = Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x);
        const arrowSize = 12;
        const arrowX = endPt.x, arrowY = endPt.y;
        const a1 = angle - Math.PI/6, a2 = angle + Math.PI/6;
        const p1 = { x: arrowX - arrowSize * Math.cos(a1), y: arrowY - arrowSize * Math.sin(a1) };
        const p2 = { x: arrowX - arrowSize * Math.cos(a2), y: arrowY - arrowSize * Math.sin(a2) };
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(endPt.x, endPt.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.fill();
        if(edge.text && edge.text.trim() !== '') {
            const midX = (startPt.x + endPt.x) / 2;
            const midY = (startPt.y + endPt.y) / 2;
            const offset = 12;
            let angleLine = angle;
            let perpX = -Math.sin(angleLine) * offset;
            let perpY = Math.cos(angleLine) * offset;
            const textX = midX + perpX, textY = midY + perpY;
            ctx.save();
            ctx.font = '12px "Segoe UI", system-ui';
            const metrics = ctx.measureText(edge.text);
            const padding = 6;
            const bgW = metrics.width + padding * 2, bgH = 20;
            ctx.fillStyle = 'rgba(255, 255, 240, 0.9)';
            ctx.fillRect(textX - bgW/2, textY - bgH/2, bgW, bgH);
            ctx.fillStyle = '#0f172b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(edge.text, textX, textY);
            ctx.restore();
        }
    }

    function findEdgeUnderPoint(mx, my) {
        let minDist = 12;
        let closestEdge = null;
        for(const edge of edges) {
            const fromNode = nodes.find(n => n.id === edge.fromId);
            const toNode = nodes.find(n => n.id === edge.toId);
            if(!fromNode || !toNode) continue;
            const startCenter = { x: fromNode.x + fromNode.width/2, y: fromNode.y + fromNode.height/2 };
            const endCenter = { x: toNode.x + toNode.width/2, y: toNode.y + toNode.height/2 };
            const startPt = getIntersectionPoint(fromNode, endCenter.x, endCenter.y, startCenter.x, startCenter.y);
            const endPt = getIntersectionPoint(toNode, startCenter.x, startCenter.y, endCenter.x, endCenter.y);
            const A = { x: startPt.x, y: startPt.y };
            const B = { x: endPt.x, y: endPt.y };
            const ABx = B.x - A.x, ABy = B.y - A.y;
            const t = ((mx - A.x) * ABx + (my - A.y) * ABy) / (ABx * ABx + ABy * ABy || 1);
            let closestX, closestY;
            if(t <= 0) { closestX = A.x; closestY = A.y; }
            else if(t >= 1) { closestX = B.x; closestY = B.y; }
            else { closestX = A.x + t * ABx; closestY = A.y + t * ABy; }
            const dx = mx - closestX, dy = my - closestY;
            const dist = Math.hypot(dx, dy);
            if(dist < minDist) {
                minDist = dist;
                closestEdge = edge;
            }
        }
        return closestEdge;
    }

    function findNodeUnderPoint(x, y) {
        for(let i = nodes.length-1; i >= 0; i--) {
            const n = nodes[i];
            if(x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height) return n;
        }
        return null;
    }

    function drawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fefefe';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        edges.forEach(edge => drawArrowEdge(edge));
        nodes.forEach(node => {
            const isHighlight = (pendingSourceNode && pendingSourceNode.id === node.id);
            drawStadium(ctx, node.x, node.y, node.width, node.height, '#f8fafc', '#334155', node.text, isHighlight);
        });
    }

    function clearPendingEdge() {
        if(pendingSourceNode) {
            pendingSourceNode = null;
            drawCanvas();
            updateStatus('已取消添加边');
        }
    }

    function openNodeModal(node) {
        currentSelectedElement = { type: 'node', data: node };
        modalTitle.innerText = `📌 节点 #${node.id}`;
        nodeSpecificDiv.style.display = 'flex';
        nodeContentInput.value = node.text;
        commentInput.value = node.comment || '';
        modalOverlay.classList.add('active');
    }

    function openEdgeModal(edge) {
        currentSelectedElement = { type: 'edge', data: edge };
        modalTitle.innerText = `🔗 边 ${edge.fromId} → ${edge.toId}`;
        nodeSpecificDiv.style.display = 'none';
        commentInput.value = edge.text || '';
        modalOverlay.classList.add('active');
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
        currentSelectedElement = null;
    }

    function saveModal() {
        if(!currentSelectedElement) return;
        if(currentSelectedElement.type === 'node') {
            const node = currentSelectedElement.data;
            const newText = nodeContentInput.value.trim();
            const newComment = commentInput.value;
            if(newText === '') {
                updateStatus('节点文字不能为空', true);
                return;
            }
            updateNode(node.id, newText, newComment);
            closeModal();
        } else if(currentSelectedElement.type === 'edge') {
            const edge = currentSelectedElement.data;
            updateEdge(edge.id, commentInput.value);
            closeModal();
        }
    }

    function deleteCurrentItem() {
        if(!currentSelectedElement) return;
        if(currentSelectedElement.type === 'node') {
            deleteNodeById(currentSelectedElement.data.id);
        } else if(currentSelectedElement.type === 'edge') {
            deleteEdgeById(currentSelectedElement.data.id);
        }
    }

    // ----- 交互核心 -----
    let mouseDownPos = { x: 0, y: 0 };
    let isDraggingFlag = false;

    function onMouseDown(e) {
        const { mx, my } = getMouseCoord(e);
        mouseDownPos = { x: mx, y: my };
        const clickedNode = findNodeUnderPoint(mx, my);
        if(clickedNode) {
            dragState.active = true;
            dragState.node = clickedNode;
            dragState.startX = mx;
            dragState.startY = my;
            dragState.offsetX = mx - clickedNode.x;
            dragState.offsetY = my - clickedNode.y;
            dragState.moved = false;
            isDraggingFlag = false;
            e.preventDefault();
        } else {
            clearPendingEdge();
            dragState.active = false;
        }
    }

    function onMouseMove(e) {
        if(!dragState.active) return;
        const { mx, my } = getMouseCoord(e);
        const dx = Math.abs(mx - dragState.startX);
        const dy = Math.abs(my - dragState.startY);
        if(!dragState.moved && (dx > 5 || dy > 5)) {
            dragState.moved = true;
            isDraggingFlag = true;
            if(pendingSourceNode) clearPendingEdge();
        }
        if(dragState.moved && dragState.node) {
            let newX = mx - dragState.offsetX;
            let newY = my - dragState.offsetY;
            newX = Math.min(Math.max(0, newX), canvas.width - dragState.node.width);
            newY = Math.min(Math.max(0, newY), canvas.height - dragState.node.height);
            dragState.node.x = newX;
            dragState.node.y = newY;
            drawCanvas();
        }
    }

    function onMouseUp(e) {
        if(!dragState.active) return;
        const { mx, my } = getMouseCoord(e);
        const wasDragging = dragState.moved;
        const clickedNode = findNodeUnderPoint(mx, my);
        const clickedEdge = !wasDragging ? findEdgeUnderPoint(mx, my) : null;
        
        if(!wasDragging) {
            if(clickedNode) {
                if(pendingSourceNode) {
                    if(pendingSourceNode.id === clickedNode.id) {
                        clearPendingEdge();
                    } else {
                        addEdge(pendingSourceNode.id, clickedNode.id, '');
                        clearPendingEdge();
                    }
                } else {
                    openNodeModal(clickedNode);
                }
            } 
            else if(clickedEdge) {
                if(pendingSourceNode) clearPendingEdge();
                openEdgeModal(clickedEdge);
            }
            else {
                if(pendingSourceNode) clearPendingEdge();
                else addNodeAt(mx, my, null, '');
            }
        }
        dragState.active = false;
        dragState.node = null;
        dragState.moved = false;
        isDraggingFlag = false;
    }

    function getMouseCoord(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let mx = (e.clientX - rect.left) * scaleX;
        let my = (e.clientY - rect.top) * scaleY;
        mx = Math.min(Math.max(0, mx), canvas.width);
        my = Math.min(Math.max(0, my), canvas.height);
        return { mx, my };
    }

    // 全局清除pending (按ESC)
    window.addEventListener('keydown', (e) => {
        if(e.key === 'Escape') {
            if(modalOverlay.classList.contains('active')) closeModal();
            else clearPendingEdge();
        }
    });

    // 模态框事件绑定
    saveBtn.addEventListener('click', saveModal);
    cancelBtn.addEventListener('click', closeModal);
    deleteBtn.addEventListener('click', deleteCurrentItem);
    closeModalBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if(e.target === modalOverlay) closeModal();
    });

    // 画布事件
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    
    // 初始化示例（两个演示节点，一条示例边）
    addNodeAt(200, 200, '起始节点', '这是第一个节点');
    addNodeAt(500, 300, '目标节点', '可以连接');
    addEdge(1, 2, '示例边');
    
    drawCanvas();
    updateStatus('编辑器已启动 — 单击空白加点，单击u再单击v加边，单击元素查看详情');
})();