// GeoProof-DAG — operation core (数据与绘图、基础逻辑)
(function(){
    const OperationCore = (function(){
        // 数据结构
        let nodes = [];
        let edges = [];
        let nextNodeId = 1;
        let nextEdgeId = 1;

        const NODE_W = 110;
        const NODE_H = 52;

        // canvas / context
        let canvas = null;
        let ctx = null;
        let canvasWidth = 0, canvasHeight = 0;

        // 状态回调（由 UI 注入）
        let statusCallback = null;
        let statusTimeout = null;

        // 连线预览与连线起点（只保存 id）
        let pendingSourceNodeId = null;
        let previewPoint = null; // {x, y} in canvas coords
        // 视图（世界坐标与屏幕的变换）
        let view = { offsetX: 0, offsetY: 0, scale: 1 };

        function updateStatus(msg, isError = false) {
            if(statusTimeout) clearTimeout(statusTimeout);
            if(typeof statusCallback === 'function') statusCallback(msg, isError);
            statusTimeout = setTimeout(() => {
                if(typeof statusCallback === 'function') statusCallback('⚡ 就绪', false);
            }, 2000);
        }

        function init(canvasEl, statusCb) {
            canvas = canvasEl;
            ctx = canvas ? canvas.getContext('2d') : null;
            statusCallback = statusCb || null;
            resizeCanvas();
        }

        function resizeCanvas() {
            if (!canvas) return;
            const container = canvas.parentElement;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const newWidth = rect.width;
            const newHeight = rect.height;
            if (canvasWidth !== newWidth || canvasHeight !== newHeight) {
                // 支持 HiDPI：使用 devicePixelRatio 设置 backing store
                const dpr = window.devicePixelRatio || 1;
                canvasWidth = newWidth;   // CSS 像素宽
                canvasHeight = newHeight; // CSS 像素高
                canvas.width = Math.round(canvasWidth * dpr);
                canvas.height = Math.round(canvasHeight * dpr);
                canvas.style.width = canvasWidth + 'px';
                canvas.style.height = canvasHeight + 'px';
                if(ctx && typeof ctx.setTransform === 'function') {
                    // 根据当前视图设置 transform（backing store 已是 dpr 缩放）
                    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.offsetX, dpr * view.offsetY);
                }
                nodes.forEach(node => {
                    node.x = Math.min(Math.max(0, node.x), canvasWidth - node.width);
                    node.y = Math.min(Math.max(0, node.y), canvasHeight - node.height);
                });
                drawCanvas();
            }
        }

        // 视图变换接口
        function screenToWorld(sx, sy) {
            // sx/sy 为 CSS 像素（相对于 canvas 显示大小）
            return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale };
        }

        function worldToScreen(wx, wy) {
            return { x: wx * view.scale + view.offsetX, y: wy * view.scale + view.offsetY };
        }

        function panBy(dx, dy) {
            view.offsetX += dx;
            view.offsetY += dy;
            if(ctx && typeof ctx.setTransform === 'function') {
                const dpr = window.devicePixelRatio || 1;
                ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.offsetX, dpr * view.offsetY);
            }
            drawCanvas();
        }

        function zoomAt(screenX, screenY, factor) {
            // 将屏幕点保持在同一世界坐标位置
            const before = screenToWorld(screenX, screenY);
            view.scale = Math.max(0.1, Math.min(4, view.scale * factor));
            const afterScr = worldToScreen(before.x, before.y);
            // 调整 offset 使得 before 世界点仍位于 screenX,screenY
            view.offsetX += (screenX - afterScr.x);
            view.offsetY += (screenY - afterScr.y);
            if(ctx && typeof ctx.setTransform === 'function') {
                const dpr = window.devicePixelRatio || 1;
                ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.offsetX, dpr * view.offsetY);
            }
            drawCanvas();
        }

        function getView() { return { ...view }; }
        function setView(v) { view.offsetX = v.offsetX || 0; view.offsetY = v.offsetY || 0; view.scale = v.scale || 1; if(ctx && typeof ctx.setTransform === 'function') { const dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.offsetX, dpr * view.offsetY); } drawCanvas(); }

        // 环检测
        function wouldCreateCycle(fromId, toId) {
            if(fromId === toId) return true;
            const adj = new Map();
            nodes.forEach(node => adj.set(node.id, []));
            edges.forEach(edge => {
                if(!adj.has(edge.fromId)) adj.set(edge.fromId, []);
                adj.get(edge.fromId).push(edge.toId);
            });
            if(!adj.has(fromId)) adj.set(fromId, []);
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
            if(!node) return false;
            edges = edges.filter(e => e.fromId !== nodeId && e.toId !== nodeId);
            nodes = nodes.filter(n => n.id !== nodeId);
            if(pendingSourceNodeId === nodeId) clearPendingSource(true);
            drawCanvas();
            updateStatus(`🗑️ 已删除节点 ${node.text}`);
            return true;
        }

        function deleteEdgeById(edgeId) {
            const edge = edges.find(e => e.id === edgeId);
            if(!edge) return false;
            edges = edges.filter(e => e.id !== edgeId);
            drawCanvas();
            updateStatus(`✂️ 已删除边`);
            return true;
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

        // 绘图相关
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
                const denom = (ABx * ABx + ABy * ABy) || 1;
                const t = ((mx - A.x) * ABx + (my - A.y) * ABy) / denom;
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
            if (!ctx || canvasWidth === 0 || canvasHeight === 0) return;
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            ctx.fillStyle = '#fefefe';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            edges.forEach(edge => drawArrowEdge(edge));
            nodes.forEach(node => {
                const isHighlight = (pendingSourceNodeId && pendingSourceNodeId === node.id);
                drawStadium(ctx, node.x, node.y, node.width, node.height, '#f8fafc', '#334155', node.text, isHighlight);
            });
            // 画连线预览（如果有）
            if(pendingSourceNodeId && previewPoint) {
                const fromNode = nodes.find(n => n.id === pendingSourceNodeId);
                if(fromNode) {
                    const startCenter = { x: fromNode.x + fromNode.width/2, y: fromNode.y + fromNode.height/2 };
                    const startPt = getIntersectionPoint(fromNode, previewPoint.x, previewPoint.y, startCenter.x, startCenter.y);
                    ctx.save();
                    ctx.setLineDash([6,6]);
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(startPt.x, startPt.y);
                    ctx.lineTo(previewPoint.x, previewPoint.y);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        function clearPendingSource(silent = false) {
            if(pendingSourceNodeId) {
                pendingSourceNodeId = null;
                previewPoint = null;
                drawCanvas();
                if(!silent) updateStatus('已取消连线模式');
            }
        }

        function setPendingSource(nodeId) {
            pendingSourceNodeId = nodeId;
            drawCanvas();
        }

        function getPendingSourceNode() {
            if(!pendingSourceNodeId) return null;
            return nodes.find(n => n.id === pendingSourceNodeId) || null;
        }

        function setPreviewPoint(pt) {
            if(!pt) previewPoint = null;
            else previewPoint = { x: pt.x, y: pt.y };
            drawCanvas();
        }

        function getNodes() { return nodes; }
        function getEdges() { return edges; }

        // 导出当前状态（用于保存为 JSON）
        function exportState() {
            return {
                nodes: JSON.parse(JSON.stringify(nodes)),
                edges: JSON.parse(JSON.stringify(edges)),
                nextNodeId,
                nextEdgeId,
                view: { ...view }
            };
        }

        // 从状态对象导入（替换当前画布数据）
        function importState(state) {
            try {
                if(!state || typeof state !== 'object') throw new Error('无效数据');
                const n = Array.isArray(state.nodes) ? state.nodes : [];
                const e = Array.isArray(state.edges) ? state.edges : [];
                nodes = n.map(x => ({
                    id: x.id,
                    text: x.text || `节点${x.id}`,
                    comment: x.comment || '',
                    x: Number(x.x) || 0,
                    y: Number(x.y) || 0,
                    width: Number(x.width) || NODE_W,
                    height: Number(x.height) || NODE_H
                }));
                edges = e.map(x => ({ id: x.id, fromId: x.fromId, toId: x.toId, text: x.text || '' }));
                nextNodeId = Number(state.nextNodeId) || (nodes.reduce((m, v) => Math.max(m, v.id), 0) + 1);
                nextEdgeId = Number(state.nextEdgeId) || (edges.reduce((m, v) => Math.max(m, v.id), 0) + 1);
                // 导入视图（可选）
                if(state.view && typeof state.view === 'object') {
                    view.offsetX = Number(state.view.offsetX) || 0;
                    view.offsetY = Number(state.view.offsetY) || 0;
                    view.scale = Number(state.view.scale) || 1;
                    if(ctx && typeof ctx.setTransform === 'function') {
                        const dpr = window.devicePixelRatio || 1;
                        ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.offsetX, dpr * view.offsetY);
                    }
                }
                drawCanvas();
                updateStatus('已加载 JSON 数据');
                return true;
            } catch(err) {
                updateStatus('加载失败：无效的 JSON', true);
                return false;
            }
        }

        return {
            init,
            resizeCanvas,
            addNodeAt,
            addEdge,
            deleteNodeById,
            deleteEdgeById,
            updateNode,
            updateEdge,
            drawCanvas,
            findNodeUnderPoint,
            findEdgeUnderPoint,
            getNodes,
            getEdges,
            exportState,
            importState,
            // 视图 API
            screenToWorld,
            worldToScreen,
            panBy,
            zoomAt,
            getView,
            setView,
            setPendingSource,
            clearPendingSource,
            getPendingSourceNode,
            setPreviewPoint
        };
    })();

    window.OperationCore = OperationCore;
})();
