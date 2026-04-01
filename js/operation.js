// GeoProof-DAG 图形编辑器核心逻辑
(function(){
    // ---------- 数据结构 ----------
    let nodes = [];
    let edges = [];
    let nextNodeId = 1;
    let nextEdgeId = 1;

    const NODE_WIDTH = 110;
    const NODE_HEIGHT = 52;

    // 拖拽状态
    let draggingNode = null;
    let dragOffsetX = 0, dragOffsetY = 0;

    // 当前交互模式
    let currentMode = 'drag';   // 'drag', 'addNode', 'addEdge', 'deleteNode', 'deleteEdge'
    // 添加边模式暂存起点
    let pendingEdgeStartNode = null;

    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');

    // ---------- 辅助函数 ----------
    function escapeHtml(str) {
        if(!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if(m === '&') return '&amp;';
            if(m === '<') return '&lt;';
            if(m === '>') return '&gt;';
            return m;
        });
    }

    // 环检测 (已有边 + 待添加 from->to)
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

    function addEdgeByIds(fromId, toId, edgeText) {
        if(!fromId || !toId) { alert('请选择有效的起点和终点'); return false; }
        if(fromId === toId) { alert('不允许添加自环边'); return false; }
        const exists = edges.some(e => e.fromId === fromId && e.toId === toId);
        if(exists) { alert('这条有向边已经存在！'); return false; }
        if(wouldCreateCycle(fromId, toId)) { alert('⚠️ 添加此边会形成环路，操作被阻止！'); return false; }
        const newEdge = { id: nextEdgeId++, fromId, toId, text: edgeText || '' };
        edges.push(newEdge);
        drawCanvas();
        return true;
    }

    function addNodeAt(x, y, nodeText) {
        if(!nodeText || nodeText.trim() === '') nodeText = `节点${nextNodeId}`;
        const newNode = {
            id: nextNodeId++,
            text: nodeText.trim(),
            x: x - NODE_WIDTH/2,
            y: y - NODE_HEIGHT/2,
            width: NODE_WIDTH,
            height: NODE_HEIGHT
        };
        nodes.push(newNode);
        drawCanvas();
        return newNode;
    }

    function deleteNodeById(nodeId) {
        edges = edges.filter(edge => edge.fromId !== nodeId && edge.toId !== nodeId);
        nodes = nodes.filter(node => node.id !== nodeId);
        if(draggingNode && draggingNode.id === nodeId) draggingNode = null;
        if(pendingEdgeStartNode && pendingEdgeStartNode.id === nodeId) pendingEdgeStartNode = null;
        drawCanvas();
    }

    function deleteEdgeById(edgeId) {
        edges = edges.filter(e => e.id !== edgeId);
        drawCanvas();
    }

    // 编辑边的文字注释
    function editEdgeText(edgeId) {
        const edge = edges.find(e => e.id === edgeId);
        if(!edge) return;
        const newText = prompt('编辑边的注释文字:', edge.text);
        if(newText !== null) {
            edge.text = newText;
            drawCanvas();
        }
    }

    // 绘制体育场形节点 (带高亮)
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

    // 寻找鼠标下的边 (线段距离)
    function findEdgeUnderPoint(mx, my) {
        let minDist = 12; // 像素阈值
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

    function drawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fefefe';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        edges.forEach(edge => drawArrowEdge(edge));
        nodes.forEach(node => {
            const isHighlight = (currentMode === 'addEdge' && pendingEdgeStartNode && pendingEdgeStartNode.id === node.id);
            drawStadium(ctx, node.x, node.y, node.width, node.height, '#f8fafc', '#334155', node.text, isHighlight);
        });
    }

    // ----- 模式切换与交互逻辑 -----
    function setMode(mode) {
        currentMode = mode;
        pendingEdgeStartNode = null; // 切换模式时清除待选起点
        document.querySelectorAll('.mode-btn').forEach(btn => {
            if(btn.getAttribute('data-mode') === mode) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        let statusText = '';
        if(mode === 'drag') statusText = '拖动模式 — 拖拽节点移动，双击节点编辑文字，双击边编辑注释';
        else if(mode === 'addNode') statusText = '添加点模式 — 单击空白区域自动添加体育场形节点（默认文字）';
        else if(mode === 'addEdge') statusText = '添加边模式 — 单击节点作为起点，再单击另一节点添加有向边（无文字）';
        else if(mode === 'deleteNode') statusText = '删除点模式 — 单击节点删除该节点及其关联边';
        else if(mode === 'deleteEdge') statusText = '删除边模式 — 单击边删除该有向边';
        document.getElementById('modeStatusText').innerText = statusText;
        drawCanvas(); // 重绘以清除高亮
    }

    function onMouseDown(e) {
        const { mx, my } = getMouseCoord(e);
        const clickedNode = findNodeUnderPoint(mx, my);
        const clickedEdge = (currentMode === 'deleteEdge') ? findEdgeUnderPoint(mx, my) : null;

        // 处理不同模式
        if(currentMode === 'drag') {
            if(clickedNode) {
                draggingNode = clickedNode;
                dragOffsetX = mx - clickedNode.x;
                dragOffsetY = my - clickedNode.y;
                canvas.style.cursor = 'grabbing';
                e.preventDefault();
            }
        }
        else if(currentMode === 'addNode') {
            if(!clickedNode) {
                // 直接添加节点，使用默认名称（不弹窗）
                const defaultName = `节点${nextNodeId}`;
                addNodeAt(mx, my, defaultName);
            }
        }
        else if(currentMode === 'addEdge') {
            if(clickedNode) {
                if(!pendingEdgeStartNode) {
                    pendingEdgeStartNode = clickedNode;
                    drawCanvas(); // 高亮起点
                } else {
                    if(pendingEdgeStartNode.id === clickedNode.id) {
                        alert('起点和终点不能相同，请重新选择起点');
                        pendingEdgeStartNode = null;
                        drawCanvas();
                        return;
                    }
                    // 直接添加边，注释为空（不弹窗）
                    addEdgeByIds(pendingEdgeStartNode.id, clickedNode.id, '');
                    pendingEdgeStartNode = null;
                    drawCanvas();
                }
            } else {
                // 点击空白取消选中
                if(pendingEdgeStartNode) {
                    pendingEdgeStartNode = null;
                    drawCanvas();
                }
            }
        }
        else if(currentMode === 'deleteNode') {
            if(clickedNode) deleteNodeById(clickedNode.id);
        }
        else if(currentMode === 'deleteEdge') {
            if(clickedEdge) deleteEdgeById(clickedEdge.id);
        }
    }

    function onMouseMove(e) {
        if(currentMode === 'drag' && draggingNode) {
            const { mx, my } = getMouseCoord(e);
            let newX = mx - dragOffsetX;
            let newY = my - dragOffsetY;
            newX = Math.min(Math.max(0, newX), canvas.width - draggingNode.width);
            newY = Math.min(Math.max(0, newY), canvas.height - draggingNode.height);
            draggingNode.x = newX;
            draggingNode.y = newY;
            drawCanvas();
        }
    }

    function onMouseUp(e) {
        if(draggingNode) {
            draggingNode = null;
            canvas.style.cursor = 'crosshair';
            drawCanvas();
        }
    }

    function onDoubleClick(e) {
        const { mx, my } = getMouseCoord(e);
        // 仅在拖动模式下支持双击编辑，避免与其他模式冲突
        if(currentMode === 'drag') {
            // 先检查边
            const clickedEdge = findEdgeUnderPoint(mx, my);
            if(clickedEdge) {
                editEdgeText(clickedEdge.id);
                return;
            }
            // 再检查节点
            const clickedNode = findNodeUnderPoint(mx, my);
            if(clickedNode) {
                const newText = prompt('编辑节点文字', clickedNode.text);
                if(newText && newText.trim() !== '') {
                    clickedNode.text = newText.trim();
                    drawCanvas();
                } else if(newText === '') alert('文字不可为空');
                return;
            }
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

    function findNodeUnderPoint(x, y) {
        for(let i = nodes.length-1; i >= 0; i--) {
            const n = nodes[i];
            if(x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height) return n;
        }
        return null;
    }

    function bindUI() {
        document.getElementById('cancelEdgeSelectionBtn').addEventListener('click', () => {
            if(pendingEdgeStartNode) {
                pendingEdgeStartNode = null;
                drawCanvas();
            }
        });
        // 模式按钮
        document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => setMode(btn.getAttribute('data-mode')));
        });
    }

    function setupCanvasEvents() {
        canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('dblclick', onDoubleClick);
    }

    function init() {
        setupCanvasEvents();
        bindUI();
        setMode('drag');
        // 画布初始为空
        drawCanvas();
    }
    init();
})();