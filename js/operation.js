// GeoProof-DAG 全功能编辑器（整合自独立测试版）
(function(){
    // ---------- 数据结构 ----------
    let nodes = [];
    let edges = [];
    let nextNodeId = 1;
    let nextEdgeId = 1;

    const NODE_W = 110;
    const NODE_H = 52;

    // 拖拽状态
    let dragState = {
        active: false,
        node: null,
        startX: 0, startY: 0,
        offsetX: 0, offsetY: 0,
        moved: false
    };

    // 连线模式暂存起点
    let pendingSourceNode = null;
    let currentSelectedElement = null;
    let isModalOpen = false;

    // DOM 元素
    const canvas = document.getElementById('dagCanvas');
    const ctx = canvas.getContext('2d');
    const statusSpan = document.getElementById('globalStatus');
    
    // 动态创建模态框（避免与全局样式冲突）
    function createModal() {
        const modalDiv = document.createElement('div');
        modalDiv.id = 'detailModal';
        modalDiv.className = 'modal-overlay';
        modalDiv.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 id="modalTitle">节点详情</h3>
                    <button class="close-btn" id="closeModalBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="nodeSpecificFields" style="display: none;">
                        <div class="field">
                            <label>📝 内容 (节点文字)</label>
                            <input type="text" id="nodeContentInput" placeholder="节点显示文本">
                        </div>
                    </div>
                    <div class="field">
                        <label>💬 注释</label>
                        <textarea id="commentInput" rows="3" placeholder="添加注释..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="deleteItemBtn" class="btn-delete">🗑️ 删除</button>
                    <button id="cancelModalBtn" class="btn-cancel">取消</button>
                    <button id="saveModalBtn" class="btn-save">保存</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);
        return modalDiv;
    }
    
    let modalOverlay, modalTitle, nodeSpecificDiv, nodeContentInput, commentInput, saveBtn, cancelBtn, deleteBtn, closeModalBtn;
    
    function initModal() {
        modalOverlay = document.getElementById('detailModal');
        if (!modalOverlay) modalOverlay = createModal();
        modalTitle = document.getElementById('modalTitle');
        nodeSpecificDiv = document.getElementById('nodeSpecificFields');
        nodeContentInput = document.getElementById('nodeContentInput');
        commentInput = document.getElementById('commentInput');
        saveBtn = document.getElementById('saveModalBtn');
        cancelBtn = document.getElementById('cancelModalBtn');
        deleteBtn = document.getElementById('deleteItemBtn');
        closeModalBtn = document.getElementById('closeModalBtn');
        
        saveBtn.addEventListener('click', saveModal);
        cancelBtn.addEventListener('click', closeModal);
        deleteBtn.addEventListener('click', deleteCurrentItem);
        closeModalBtn.addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => {
            if(e.target === modalOverlay) closeModal();
        });
    }
    
    let canvasWidth = 0, canvasHeight = 0;
    let statusTimeout = null;
    
    function updateStatus(msg, isError = false) {
        if(statusTimeout) clearTimeout(statusTimeout);
        statusSpan.innerText = msg;
        statusSpan.style.color = isError ? '#b91c1c' : '#1e40af';
        statusTimeout = setTimeout(() => {
            if(statusSpan.innerText === msg) statusSpan.innerText = '⚡ 就绪';
            statusSpan.style.color = '#1e40af';
        }, 2000);
    }
    
    function resizeCanvas() {
        const container = canvas.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const newWidth = rect.width;
        const newHeight = rect.height;
        if (canvasWidth !== newWidth || canvasHeight !== newHeight) {
            canvasWidth = newWidth;
            canvasHeight = newHeight;
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            nodes.forEach(node => {
                node.x = Math.min(Math.max(0, node.x), canvasWidth - node.width);
                node.y = Math.min(Math.max(0, node.y), canvasHeight - node.height);
            });
            drawCanvas();
        }
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
        let nx = x - NODE_W/2;
        let ny = y - NODE_H/2;
        nx = Math.min(Math.max(0, nx), canvasWidth - NODE_W);
        ny = Math.min(Math.max(0, ny), canvasHeight - NODE_H);
        const defaultName = text || `节点${nextNodeId}`;
        const newNode = {
            id: nextNodeId++,
            text: defaultName,
            comment: comment || '',
            x: nx,
            y: ny,
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
            if(pendingSourceNode && pendingSourceNode.id === nodeId) clearPendingEdge();
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
    
    // 绘图函数
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
        if (canvasWidth === 0 || canvasHeight === 0) return;
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = '#fefefe';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        edges.forEach(edge => drawArrowEdge(edge));
        nodes.forEach(node => {
            const isHighlight = (pendingSourceNode && pendingSourceNode.id === node.id);
            drawStadium(ctx, node.x, node.y, node.width, node.height, '#f8fafc', '#334155', node.text, isHighlight);
        });
    }
    
    function clearPendingEdge(silent = false) {
        if(pendingSourceNode) {
            pendingSourceNode = null;
            drawCanvas();
            if(!silent) updateStatus('已取消连线模式');
        }
    }
    
    function openNodeModal(node) {
        if(isModalOpen) return;
        clearPendingEdge();
        isModalOpen = true;
        currentSelectedElement = { type: 'node', data: node };
        modalTitle.innerText = `📌 节点 #${node.id}`;
        nodeSpecificDiv.style.display = 'flex';
        nodeContentInput.value = node.text;
        commentInput.value = node.comment || '';
        modalOverlay.classList.add('active');
    }
    
    function openEdgeModal(edge) {
        if(isModalOpen) return;
        clearPendingEdge();
        isModalOpen = true;
        currentSelectedElement = { type: 'edge', data: edge };
        modalTitle.innerText = `🔗 边 ${edge.fromId} → ${edge.toId}`;
        nodeSpecificDiv.style.display = 'none';
        commentInput.value = edge.text || '';
        modalOverlay.classList.add('active');
    }
    
    function closeModal() {
        if(!isModalOpen) return;
        modalOverlay.classList.remove('active');
        currentSelectedElement = null;
        isModalOpen = false;
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
    
    // 交互事件
    let mouseDownPos = { x: 0, y: 0 };
    let dragStarted = false;
    let dragTargetNode = null;
    let lastClickTime = 0;
    let lastClickTarget = null;
    let clickTimer = null;
    
    canvas.addEventListener('mousedown', (e) => {
        if(isModalOpen) return;
        const { mx, my } = getMouseCoord(e);
        mouseDownPos = { x: mx, y: my };
        dragStarted = false;
        dragTargetNode = findNodeUnderPoint(mx, my);
        if(dragTargetNode) {
            dragState.active = true;
            dragState.node = dragTargetNode;
            dragState.startX = mx;
            dragState.startY = my;
            dragState.offsetX = mx - dragTargetNode.x;
            dragState.offsetY = my - dragTargetNode.y;
            dragState.moved = false;
            e.preventDefault();
        } else {
            dragState.active = false;
        }
    });
    
    window.addEventListener('mousemove', (e) => {
        if(isModalOpen) return;
        if(!dragState.active) return;
        const { mx, my } = getMouseCoord(e);
        const dx = Math.abs(mx - dragState.startX);
        const dy = Math.abs(my - dragState.startY);
        if(!dragState.moved && (dx > 5 || dy > 5)) {
            dragState.moved = true;
            dragStarted = true;
            if(pendingSourceNode) clearPendingEdge();
        }
        if(dragState.moved && dragState.node) {
            let newX = mx - dragState.offsetX;
            let newY = my - dragState.offsetY;
            newX = Math.min(Math.max(0, newX), canvasWidth - dragState.node.width);
            newY = Math.min(Math.max(0, newY), canvasHeight - dragState.node.height);
            dragState.node.x = newX;
            dragState.node.y = newY;
            drawCanvas();
        }
    });
    
    window.addEventListener('mouseup', (e) => {
        if(isModalOpen) return;
        if(dragState.active && dragState.moved) {
            dragState.active = false;
            dragState.node = null;
            dragState.moved = false;
            dragStarted = false;
            dragTargetNode = null;
            return;
        }
        const { mx, my } = getMouseCoord(e);
        const clickedNode = findNodeUnderPoint(mx, my);
        const clickedEdge = !clickedNode ? findEdgeUnderPoint(mx, my) : null;
        let targetType = null;
        let targetData = null;
        if(clickedNode) {
            targetType = 'node';
            targetData = clickedNode;
        } else if(clickedEdge) {
            targetType = 'edge';
            targetData = clickedEdge;
        } else {
            targetType = 'blank';
            targetData = null;
        }
        let targetId = null;
        if(targetType === 'node') targetId = `node_${targetData.id}`;
        else if(targetType === 'edge') targetId = `edge_${targetData.id}`;
        else targetId = 'blank';
        const now = Date.now();
        const isDouble = (now - lastClickTime < 300) && (targetId === lastClickTarget);
        lastClickTime = now;
        lastClickTarget = targetId;
        if(clickTimer) clearTimeout(clickTimer);
        if(isDouble) {
            if(targetType === 'node') {
                openNodeModal(targetData);
            } else if(targetType === 'edge') {
                openEdgeModal(targetData);
            }
            if(pendingSourceNode) clearPendingEdge();
            dragState.active = false;
            dragState.node = null;
            dragState.moved = false;
            dragStarted = false;
            dragTargetNode = null;
            return;
        }
        clickTimer = setTimeout(() => {
            if(targetType === 'node') {
                if(pendingSourceNode) {
                    if(pendingSourceNode.id === targetData.id) {
                        clearPendingEdge();
                    } else {
                        const success = addEdge(pendingSourceNode.id, targetData.id, '');
                        clearPendingEdge(true);
                        if (!success) {}
                    }
                } else {
                    pendingSourceNode = targetData;
                    drawCanvas();
                    updateStatus(`🔗 已选择起点 “${targetData.text}”，请单击目标节点添加边`);
                }
            } else if(targetType === 'edge') {
                openEdgeModal(targetData);
            } else if(targetType === 'blank') {
                if(pendingSourceNode) clearPendingEdge();
                addNodeAt(mx, my, null, '');
            }
            clickTimer = null;
        }, 200);
        dragState.active = false;
        dragState.node = null;
        dragState.moved = false;
        dragStarted = false;
        dragTargetNode = null;
    });
    
    window.addEventListener('keydown', (e) => {
        if(e.key === 'Escape') {
            if(isModalOpen) {
                closeModal();
            } else {
                clearPendingEdge();
            }
        }
    });
    
    window.addEventListener('resize', () => {
        resizeCanvas();
    });
    
    function init() {
        initModal();
        resizeCanvas();
        setTimeout(() => {
            if (canvasWidth > 0 && canvasHeight > 0 && nodes.length === 0) {
                addNodeAt(canvasWidth * 0.3, canvasHeight * 0.4, '起始节点', '这是第一个节点');
                addNodeAt(canvasWidth * 0.7, canvasHeight * 0.6, '目标节点', '可以连接');
                addEdge(1, 2, '示例边');
                drawCanvas();
            }
        }, 100);
        updateStatus('编辑器已启动 — 全屏模式，单击节点连线，双击节点编辑，单击边修改注释，空白处加点');
    }
    
    init();
})();