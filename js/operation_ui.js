// GeoProof-DAG — operation UI（事件、模态、交互）
(function(){
    if(typeof OperationCore === 'undefined') {
        console.error('OperationCore 未定义：请确保先加载 operation_core.js');
        return;
    }

    const canvas = document.getElementById('dagCanvas');
    const statusSpan = document.getElementById('globalStatus');

    function setStatus(msg, isError = false) {
        if(!statusSpan) return;
        statusSpan.innerText = msg;
        statusSpan.style.color = isError ? '#b91c1c' : '#1e40af';
    }

    OperationCore.init(canvas, setStatus);

    // 动态创建模态框（UI 负责）
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

    let isModalOpen = false;
    let currentSelectedElement = null;

    function openNodeModal(node) {
        if(isModalOpen) return;
        OperationCore.clearPendingSource();
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
        OperationCore.clearPendingSource();
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
            if(newText === '') { setStatus('节点文字不能为空', true); return; }
            OperationCore.updateNode(node.id, newText, newComment);
            closeModal();
        } else if(currentSelectedElement.type === 'edge') {
            const edge = currentSelectedElement.data;
            OperationCore.updateEdge(edge.id, commentInput.value);
            closeModal();
        }
    }

    function deleteCurrentItem() {
        if(!currentSelectedElement) return;
        if(currentSelectedElement.type === 'node') {
            const node = currentSelectedElement.data;
            if(confirm(`确定要删除节点“${node.text}”及其所有关联边吗？`)) {
                OperationCore.deleteNodeById(node.id);
                closeModal();
            }
        } else if(currentSelectedElement.type === 'edge') {
            const edge = currentSelectedElement.data;
            if(confirm('确定要删除这条边吗？')) {
                OperationCore.deleteEdgeById(edge.id);
                closeModal();
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

    function determineCursorAt(mx, my) {
        if (isModalOpen) return 'default';
        if (dragState.active && dragState.moved) return 'grabbing';
        if (OperationCore.getPendingSourceNode()) return 'crosshair';
        if (OperationCore.findNodeUnderPoint(mx, my)) return 'grab';
        if (OperationCore.findEdgeUnderPoint(mx, my)) return 'pointer';
        return 'crosshair';
    }

    // 交互状态
    let dragState = { active: false, node: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0, moved: false };
    let mouseDownPos = { x: 0, y: 0 };
    let dragStarted = false;
    let dragTargetNode = null;
    let lastClickTime = 0;
    let lastClickTarget = null;
    let clickTimer = null;

    // 实时光标变化
    canvas.addEventListener('mousemove', (e) => {
        if (!canvas) return;
        const { mx, my } = getMouseCoord(e);
        const cursor = determineCursorAt(mx, my);
        canvas.style.cursor = cursor;
        // 如果处于连线模式且没有在拖拽，显示预览
        if(!dragState.active && OperationCore.getPendingSourceNode()) {
            OperationCore.setPreviewPoint({ x: mx, y: my });
        }
    });

    canvas.addEventListener('mouseleave', () => { canvas.style.cursor = 'default'; });

    canvas.addEventListener('mousedown', (e) => {
        if(isModalOpen) return;
        const { mx, my } = getMouseCoord(e);
        mouseDownPos = { x: mx, y: my };
        dragStarted = false;
        dragTargetNode = OperationCore.findNodeUnderPoint(mx, my);
        if(dragTargetNode) {
            dragState.active = true;
            dragState.node = dragTargetNode;
            dragState.startX = mx;
            dragState.startY = my;
            dragState.offsetX = mx - dragTargetNode.x;
            dragState.offsetY = my - dragTargetNode.y;
            dragState.moved = false;
            canvas.style.cursor = 'grabbing';
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
            if(OperationCore.getPendingSourceNode()) OperationCore.clearPendingSource();
        }
        if(dragState.moved && dragState.node) {
            let newX = mx - dragState.offsetX;
            let newY = my - dragState.offsetY;
            newX = Math.min(Math.max(0, newX), canvas.width - dragState.node.width);
            newY = Math.min(Math.max(0, newY), canvas.height - dragState.node.height);
            dragState.node.x = newX;
            dragState.node.y = newY;
            OperationCore.drawCanvas();
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
        const rect = canvas.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
            dragState.active = false;
            dragState.node = null;
            dragState.moved = false;
            dragStarted = false;
            dragTargetNode = null;
            return;
        }

        const { mx, my } = getMouseCoord(e);
        const clickedNode = OperationCore.findNodeUnderPoint(mx, my);
        const clickedEdge = !clickedNode ? OperationCore.findEdgeUnderPoint(mx, my) : null;
        let targetType = null;
        let targetData = null;
        if(clickedNode) { targetType = 'node'; targetData = clickedNode; }
        else if(clickedEdge) { targetType = 'edge'; targetData = clickedEdge; }
        else { targetType = 'blank'; targetData = null; }

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
            if(targetType === 'node') openNodeModal(targetData);
            else if(targetType === 'edge') openEdgeModal(targetData);
            if(OperationCore.getPendingSourceNode()) OperationCore.clearPendingSource();
            dragState.active = false;
            dragState.node = null;
            dragState.moved = false;
            dragStarted = false;
            dragTargetNode = null;
            return;
        }

        clickTimer = setTimeout(() => {
            if(targetType === 'node') {
                const pending = OperationCore.getPendingSourceNode();
                if(pending) {
                    if(pending.id === targetData.id) {
                        OperationCore.clearPendingSource();
                    } else {
                        const success = OperationCore.addEdge(pending.id, targetData.id, '');
                        OperationCore.clearPendingSource(true);
                        if(!success) {
                            // addEdge 已由 core 打印错误提示
                        }
                    }
                } else {
                    OperationCore.setPendingSource(targetData.id);
                    setStatus(`🔗 已选择起点 “${targetData.text}”，请单击目标节点添加边`);
                    canvas.style.cursor = 'crosshair';
                }
            } else if(targetType === 'edge') {
                openEdgeModal(targetData);
            } else if(targetType === 'blank') {
                if(OperationCore.getPendingSourceNode()) OperationCore.clearPendingSource();
                OperationCore.addNodeAt(mx, my, null, '');
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
            if(isModalOpen) closeModal();
            else OperationCore.clearPendingSource();
        }
    });

    // 绑定模态事件并初始化
    initModal();

    // 窗口大小改变
    window.addEventListener('resize', () => OperationCore.resizeCanvas());

    // 初始化示例节点
    setTimeout(() => {
        if (canvas && canvas.width > 0 && canvas.height > 0 && OperationCore.getNodes().length === 0) {
            OperationCore.addNodeAt(canvas.width * 0.3, canvas.height * 0.4, '起始节点', '这是第一个节点');
            OperationCore.addNodeAt(canvas.width * 0.7, canvas.height * 0.6, '目标节点', '可以连接');
            OperationCore.addEdge(1, 2, '示例边');
            OperationCore.drawCanvas();
        }
    }, 100);

    setStatus('编辑器已启动 — 单击节点连线，双击节点编辑，单击边修改注释，空白处加点');
})();
