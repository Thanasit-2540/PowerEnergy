let appMeters = [];
let appRecorders = [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('history-date').value = new Date().toLocaleDateString('en-CA');
    document.getElementById('edit-date').value = new Date().toLocaleDateString('en-CA');
    loadSettings();
    loadDataForDate(new Date().toLocaleDateString('en-CA'), 'today-container', 'today');
});

async function tryOpenSettings() {
    const pass = prompt('กรุณาใส่รหัสผ่านเพื่อเข้าสู่โหมดแอดมิน:');
    if (pass === null) return; // User cancelled
    
    const res = await fetch('/api/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
    });
    const json = await res.json();
    
    if (json.success) {
        showTab('settings');
        // เติมรายชื่อจุดมิเตอร์ลงใน Dropdown สำหรับค้นหา
        const ms = document.getElementById('edit-meter-select');
        ms.innerHTML = '<option value="">-- เลือกจุดมิเตอร์ที่ต้องการแก้ --</option>' + 
                       appMeters.map(m => `<option value="${m.id}">${m.name} (รหัส: ${m.id})</option>`).join('');
    } else {
        alert('รหัสผ่านไม่ถูกต้อง!');
    }
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`view-${tabName}`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

async function loadSettings() {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success) {
        appMeters = json.meters;
        appRecorders = json.recorders;
        renderSettings();
    }
}

function renderSettings() {
    const rl = document.getElementById('recorders-list');
    rl.innerHTML = appRecorders.map(r => `
        <li class="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded border dark:border-gray-600">
            <span class="dark:text-gray-200">${r}</span>
            <button onclick="deleteRecorder('${r}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
        </li>
    `).join('');

    const ml = document.getElementById('meters-list');
    ml.innerHTML = appMeters.map(m => `
        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded border dark:border-gray-600 text-sm">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <div class="font-bold dark:text-white">${m.name}</div>
                    <div class="text-gray-500 dark:text-gray-400">รหัส: ${m.id} | ${m.type === 'electric' ? 'ไฟฟ้า' : 'ประปา'}</div>
                </div>
                <button onclick="deleteMeter('${m.id}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
            </div>
            <button onclick="openQrModal('${m.id}', '${m.name}', '${m.type}')" class="w-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 py-1 rounded font-medium hover:bg-blue-200">
                <i class="fa-solid fa-qrcode mr-1"></i> ดู QR Code
            </button>
        </div>
    `).join('');
}

async function addRecorder() {
    const name = document.getElementById('new-recorder').value.trim();
    if (!name) return;
    await fetch('/api/settings/add-recorder', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
    document.getElementById('new-recorder').value = '';
    loadSettings();
}

async function deleteRecorder(name) {
    if(!confirm('ลบพนักงาน?')) return;
    await fetch('/api/settings/delete-recorder', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
    loadSettings();
}

async function addMeter() {
    const id = document.getElementById('meter-id').value.trim();
    const name = document.getElementById('meter-name').value.trim();
    const type = document.getElementById('meter-type').value;
    if (!id || !name) return;
    await fetch('/api/settings/add-meter', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, name, type}) });
    document.getElementById('meter-id').value = '';
    document.getElementById('meter-name').value = '';
    loadSettings();
}

async function deleteMeter(id) {
    if(!confirm('ลบจุดมิเตอร์?')) return;
    await fetch('/api/settings/delete-meter', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
    loadSettings();
}

async function manualCleanup() {
    if(!confirm('ยืนยันลบข้อมูลที่อายุเกิน 60 วันทั้งหมด?')) return;
    const res = await fetch('/api/cleanup-manual', { method: 'POST' });
    const json = await res.json();
    alert(`ลบข้อมูลเรียบร้อยแล้ว: ${json.count} รายการ`);
}

// QR Code Logic
let currentQrId = '';
function openQrModal(id, name, type) {
    currentQrId = id;
    const typeStr = type === 'electric' ? 'ไฟฟ้า' : 'ประปา';
    
    document.getElementById('qr-details').innerHTML = `
        <div class="font-bold text-lg">${name}</div>
        <div>รหัสจุด: ${id}</div>
        <div>ประเภท: ${typeStr}</div>
    `;
    
    document.getElementById('qr-code-display').innerHTML = '';
    const url = window.location.origin + '/scan.html?meter=' + id;
    new QRCode(document.getElementById('qr-code-display'), {
        text: url,
        width: 200,
        height: 200
    });
    
    document.getElementById('qr-modal').classList.remove('hidden');
}

function closeQrModal() {
    document.getElementById('qr-modal').classList.add('hidden');
}

function downloadQR() {
    const canvas = document.querySelector('#qr-code-display canvas');
    if(canvas) {
        const link = document.createElement('a');
        link.download = `QR_${currentQrId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
}

// Data Loading & Rendering
function loadHistoryData() {
    const dateStr = document.getElementById('history-date').value;
    if (dateStr) {
        loadDataForDate(dateStr, 'history-container', 'history');
    }
}

async function loadDataForEdit() {
    const dateStr = document.getElementById('edit-date').value;
    const meterId = document.getElementById('edit-meter-select').value;
    
    if (!dateStr || !meterId) return alert('กรุณาเลือกวันที่ และ จุดมิเตอร์');
    
    const container = document.getElementById('edit-container');
    container.innerHTML = '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    
    const res = await fetch('/api/records?date=' + dateStr);
    const json = await res.json();
    
    if (json.success) {
        // กรองเอาเฉพาะ meter ที่เลือก
        const el = json.electric.filter(r => r["House Number"] === meterId);
        const wa = json.water.filter(r => r["House Number"] === meterId);
        
        if (el.length === 0 && wa.length === 0) {
            container.innerHTML = '<div class="text-red-500 font-bold p-4 bg-red-50 rounded">ไม่พบข้อมูลของจุดมิเตอร์นี้ในวันที่เลือก (อาจยังไม่มีคนจด)</div>';
            return;
        }
        
        renderDataTables(el, wa, container, 'edit');
    } else {
        container.innerHTML = '<div class="text-red-500">Error loading data</div>';
    }
}

async function loadDataForDate(dateStr, containerId, mode) {
    const container = document.getElementById(containerId);
    container.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    
    const res = await fetch('/api/records?date=' + dateStr);
    const json = await res.json();
    
    if(json.success) {
        renderDataTables(json.electric, json.water, container, mode);
    } else {
        container.innerHTML = '<div class="text-red-500">Error loading data</div>';
    }
}

// mode = 'today' (กรอกได้ถ้ายังว่าง), 'history' (อ่านอย่างเดียว), 'edit' (แอดมินแก้ได้เสมอ)
function renderDataTables(electric, water, container, mode) {
    let html = '';

    // ไฟฟ้า
    html += `<h3 class="font-bold text-lg text-blue-600 dark:text-blue-400 mb-2 mt-4"><i class="fa-solid fa-bolt mr-2"></i>ไฟฟ้า (${electric.length} รายการ)</h3>`;
    if (electric.length === 0) {
        html += `<div class="bg-white dark:bg-gray-800 p-4 rounded shadow text-gray-500 text-center">ไม่มีข้อมูลไฟฟ้า</div>`;
    } else {
        electric.forEach(r => {
            const isFilled = r['010'] !== null && r['011'] !== null && r['012'] !== null;
            const canEdit = mode === 'edit' || (mode === 'today' && !isFilled);
            
            html += `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow mb-4 border-l-4 ${mode === 'edit' ? 'border-yellow-500' : 'border-blue-500'}">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="font-bold text-lg">${r["House Number"]}</span>
                        <span class="text-sm text-gray-500 ml-2">ผู้จด: ${r.recorder_name}</span>
                    </div>
                    <div class="text-xs text-gray-400">${new Date(r.created_at).toLocaleTimeString('th-TH')}</div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <!-- 010 -->
                    <div>
                        <div class="text-xs mb-1 font-bold">หน้าจอ 010</div>
                        ${r.IMG010 ? `<a href="${r.IMG010}" target="_blank"><img src="${r.IMG010}" class="w-full h-32 object-cover rounded mb-2 border"></a>` : '<div class="h-32 bg-gray-100 rounded mb-2 flex items-center justify-center text-xs">ไม่มีรูป</div>'}
                        ${canEdit ? `<input type="number" step="0.001" id="val-010-${r.id}" value="${r['010'] || ''}" placeholder="กรอกเลข 010" class="w-full p-2 border rounded dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500">` : `<div class="p-2 bg-gray-100 dark:bg-gray-700 rounded font-bold">${r['010'] || '-'}</div>`}
                    </div>
                    <!-- 011 -->
                    <div>
                        <div class="text-xs mb-1 font-bold">หน้าจอ 011</div>
                        ${r.IMG011 ? `<a href="${r.IMG011}" target="_blank"><img src="${r.IMG011}" class="w-full h-32 object-cover rounded mb-2 border"></a>` : '<div class="h-32 bg-gray-100 rounded mb-2 flex items-center justify-center text-xs">ไม่มีรูป</div>'}
                        ${canEdit ? `<input type="number" step="0.001" id="val-011-${r.id}" value="${r['011'] || ''}" placeholder="กรอกเลข 011" class="w-full p-2 border rounded dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500">` : `<div class="p-2 bg-gray-100 dark:bg-gray-700 rounded font-bold">${r['011'] || '-'}</div>`}
                    </div>
                    <!-- 012 -->
                    <div>
                        <div class="text-xs mb-1 font-bold">หน้าจอ 012</div>
                        ${r.IMG012 ? `<a href="${r.IMG012}" target="_blank"><img src="${r.IMG012}" class="w-full h-32 object-cover rounded mb-2 border"></a>` : '<div class="h-32 bg-gray-100 rounded mb-2 flex items-center justify-center text-xs">ไม่มีรูป</div>'}
                        ${canEdit ? `<input type="number" step="0.001" id="val-012-${r.id}" value="${r['012'] || ''}" placeholder="กรอกเลข 012" class="w-full p-2 border rounded dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500">` : `<div class="p-2 bg-gray-100 dark:bg-gray-700 rounded font-bold">${r['012'] || '-'}</div>`}
                    </div>
                </div>
                ${canEdit ? `
                    <div class="flex items-center">
                        <button onclick="saveValues('${r.id}', 'electric', '${mode}')" class="${mode === 'edit' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700'} text-white px-6 py-2 rounded font-bold"><i class="fa-solid fa-save mr-2"></i>บันทึกค่า</button>
                        <span id="status-${mode}-${r.id}" class="ml-4 text-green-500 text-sm hidden font-bold"><i class="fa-solid fa-check mr-1"></i>บันทึกแล้ว!</span>
                    </div>
                ` : ``}
            </div>
            `;
        });
    }

    // ประปา
    html += `<h3 class="font-bold text-lg text-teal-600 dark:text-teal-400 mb-2 mt-6"><i class="fa-solid fa-droplet mr-2"></i>ประปา (${water.length} รายการ)</h3>`;
    if (water.length === 0) {
        html += `<div class="bg-white dark:bg-gray-800 p-4 rounded shadow text-gray-500 text-center">ไม่มีข้อมูลประปา</div>`;
    } else {
        water.forEach(r => {
            const isFilled = r.water_value !== null;
            const canEdit = mode === 'edit' || (mode === 'today' && !isFilled);
            
            html += `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow mb-4 border-l-4 ${mode === 'edit' ? 'border-yellow-500' : 'border-teal-500'}">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="font-bold text-lg">${r["House Number"]}</span>
                        <span class="text-sm text-gray-500 ml-2">ผู้จด: ${r.recorder_name}</span>
                    </div>
                    <div class="text-xs text-gray-400">${new Date(r.created_at).toLocaleTimeString('th-TH')}</div>
                </div>
                
                <div class="flex flex-col md:flex-row gap-4 mb-4">
                    <div class="md:w-1/3">
                        <div class="text-xs mb-1 font-bold">หน้าปัดน้ำ</div>
                        ${r.water_img ? `<a href="${r.water_img}" target="_blank"><img src="${r.water_img}" class="w-full h-48 object-cover rounded border"></a>` : '<div class="h-48 bg-gray-100 rounded flex items-center justify-center text-xs">ไม่มีรูป</div>'}
                    </div>
                    <div class="md:w-2/3 flex flex-col justify-center">
                        <label class="text-sm font-bold mb-2">ค่าน้ำ (หน่วย)</label>
                        ${canEdit ? `
                            <input type="number" step="0.001" id="val-water-${r.id}" value="${r.water_value || ''}" placeholder="กรอกตัวเลขหน้าปัด" class="w-full p-3 border rounded text-lg dark:bg-gray-700 outline-none focus:ring-2 focus:ring-teal-500 mb-4">
                            <div class="flex items-center">
                                <button onclick="saveValues('${r.id}', 'water', '${mode}')" class="${mode === 'edit' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-teal-600 hover:bg-teal-700'} text-white px-8 py-3 rounded font-bold"><i class="fa-solid fa-save mr-2"></i>บันทึกค่าน้ำ</button>
                                <span id="status-${mode}-${r.id}" class="ml-4 text-green-500 font-bold hidden"><i class="fa-solid fa-check mr-1"></i>บันทึกแล้ว!</span>
                            </div>
                        ` : `
                            <div class="p-4 bg-gray-100 dark:bg-gray-700 rounded text-xl font-bold">${r.water_value || '-'}</div>
                        `}
                    </div>
                </div>
            </div>
            `;
        });
    }

    container.innerHTML = html;
}

async function saveValues(id, type, mode) {
    let values = {};
    if (type === 'electric') {
        values['010'] = document.getElementById(`val-010-${id}`).value || null;
        values['011'] = document.getElementById(`val-011-${id}`).value || null;
        values['012'] = document.getElementById(`val-012-${id}`).value || null;
    } else {
        values['water_value'] = document.getElementById(`val-water-${id}`).value || null;
    }

    const res = await fetch('/api/update-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type, values })
    });
    
    const json = await res.json();
    if(json.success) {
        const stat = document.getElementById(`status-${mode}-${id}`);
        stat.classList.remove('hidden');
        setTimeout(() => {
            stat.classList.add('hidden');
            // ถ้ายืนยันจากหน้า Today ให้รีโหลดใหม่เพื่อล็อคฟอร์ม
            if (mode === 'today') {
                loadDataForDate(new Date().toLocaleDateString('en-CA'), 'today-container', 'today');
            }
        }, 1500);
    } else {
        alert('บันทึกผิดพลาด!');
    }
}
