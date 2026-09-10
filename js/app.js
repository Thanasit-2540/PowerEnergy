// js/app.js
// แกนหลักการทำงานของแอป (UI State, Camera, AI Logic)

// ==========================================
// 1. DATA STATE (MOCK DB with LocalStorage)
// ==========================================
const defaultMeters = [
    { id: 'elec_1', name: 'ไฟฟ้า จุดที่ 1', type: 'electric' },
    { id: 'elec_2', name: 'ไฟฟ้า จุดที่ 2', type: 'electric' },
    { id: 'water_1', name: 'ประปา จุดที่ 1', type: 'water' },
    { id: 'water_2', name: 'ประปา จุดที่ 2', type: 'water' }
];

let appMeters = JSON.parse(localStorage.getItem('appMeters')) || defaultMeters;
let appRecorders = JSON.parse(localStorage.getItem('appRecorders')) || ['พนักงาน A', 'พนักงาน B'];
let appRecords = JSON.parse(localStorage.getItem('appRecords')) || [];

let slotsData = []; // เก็บสถานะของช่องถ่ายรูปหน้าฟอร์มปัจจุบัน
let activeMeter = null; // มิเตอร์จุดที่กำลังจดอยู่

// ==========================================
// 2. THEME & VIEW ROUTING
// ==========================================
function toggleTheme() {
    const htmlObj = document.documentElement;
    if (htmlObj.classList.contains('dark')) {
        htmlObj.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        htmlObj.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
}

function initTheme() {
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.classList.add('dark');
    }
}

function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active', 'flex'));
    
    const target = document.getElementById('view-' + viewId);
    target.classList.add('active');
    
    // อัปเดตสถิติถ้าเป็นหน้า dashboard
    if (viewId === 'dashboard') {
        updateDashboardStats();
    }
}

// ==========================================
// 3. DASHBOARD STATS
// ==========================================
function updateDashboardStats() {
    const now = new Date();
    const todayStr = now.toLocaleDateString('th-TH');
    
    // ข้อมูลทั้งหมด
    const totalElec = appMeters.filter(m => m.type === 'electric').length;
    const totalWater = appMeters.filter(m => m.type === 'water').length;
    
    // ข้อมูลที่จดวันนี้แล้ว
    const todayRecords = appRecords.filter(r => r.date === todayStr);
    
    // นับจำนวนจุดที่ไม่ซ้ำที่จดไปแล้ววันนี้
    const elecDoneIds = new Set(todayRecords.filter(r => r.type === 'electric').map(r => r.meterId));
    const waterDoneIds = new Set(todayRecords.filter(r => r.type === 'water').map(r => r.meterId));
    
    const elecDone = elecDoneIds.size;
    const waterDone = waterDoneIds.size;
    
    // คำนวณค้างจด
    const elecPending = totalElec - elecDone;
    const waterPending = totalWater - waterDone;

    // อัปเดตขึ้นหน้าจอ
    document.getElementById('stat-elec-done').innerText = elecDone;
    document.getElementById('stat-elec-pending').innerText = elecPending;
    document.getElementById('stat-water-done').innerText = waterDone;
    document.getElementById('stat-water-pending').innerText = waterPending;
}

// ==========================================
// 4. DYNAMIC RECORDING FORM
// ==========================================
function openRecordView() {
    const recSelect = document.getElementById('recorder-name');
    recSelect.innerHTML = appRecorders.map(r => `<option value="${r}">${r}</option>`).join('');
    
    const metSelect = document.getElementById('meter-type');
    metSelect.innerHTML = '<option value="">-- เลือกจุดมิเตอร์ --</option>' + 
        appMeters.map(m => `<option value="${m.id}">${m.name} (${m.type === 'electric' ? 'ไฟฟ้า' : 'น้ำ'})</option>`).join('');
    
    recSelect.value = localStorage.getItem('lastRecorder') || appRecorders[0];
    metSelect.value = '';
    
    document.getElementById('slots-container').innerHTML = '';
    document.getElementById('btn-save').classList.add('hidden');
    document.getElementById('record-hint').classList.add('hidden');

    showView('record');
}

function handleMeterSelection() {
    const meterId = document.getElementById('meter-type').value;
    activeMeter = appMeters.find(m => m.id === meterId);
    
    if (!activeMeter) {
        document.getElementById('slots-container').innerHTML = '';
        document.getElementById('btn-save').classList.add('hidden');
        document.getElementById('record-hint').classList.add('hidden');
        return;
    }

    if (activeMeter.type === 'electric') {
        slotsData = [
            { id: 1, title: 'รูปที่ 1 (ไฟฟ้า)', file: null, code: '', value: '', status: 'idle' },
            { id: 2, title: 'รูปที่ 2 (ไฟฟ้า)', file: null, code: '', value: '', status: 'idle' },
            { id: 3, title: 'รูปที่ 3 (ไฟฟ้า)', file: null, code: '', value: '', status: 'idle' }
        ];
    } else {
        slotsData = [
            { id: 1, title: 'รูปมิเตอร์น้ำ', file: null, code: 'water', value: '', status: 'idle' }
        ];
    }
    
    document.getElementById('record-hint').classList.remove('hidden');
    document.getElementById('btn-save').classList.remove('hidden');
    renderSlots();
}

function renderSlots() {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';
    
    slotsData.forEach(slot => {
        const isWater = activeMeter.type === 'water';
        const slotHTML = `
        <div class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg border-t-4 border-blue-500 transition duration-300">
            <h3 class="font-bold text-gray-700 dark:text-gray-200 mb-2">${slot.title}</h3>
            
            <div id="upload-box-${slot.id}" class="${slot.file ? 'hidden' : ''}">
                <input type="file" id="camera-${slot.id}" accept="image/*" capture="camera" class="hidden" onchange="handleImage(event, ${slot.id})">
                <button type="button" onclick="document.getElementById('camera-${slot.id}').click()" class="w-full border-2 border-dashed border-gray-400 text-gray-600 dark:text-gray-300 font-medium py-6 rounded-lg flex flex-col items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 transition">
                    <i class="fa-solid fa-camera fa-2x mb-2 text-blue-500"></i>
                    <span>แตะเพื่อถ่ายรูป</span>
                </button>
            </div>

            <div id="result-box-${slot.id}" class="${!slot.file ? 'hidden' : ''} space-y-3">
                <div class="relative">
                    <img id="preview-${slot.id}" src="" class="w-full h-32 object-cover rounded-lg border dark:border-gray-600">
                    <button type="button" onclick="retakePhoto(${slot.id})" class="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center shadow hover:bg-red-600 transition">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                </div>
                
                <div class="flex space-x-2">
                    ${!isWater ? `
                    <div class="w-1/3">
                        <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">รหัสหน้าจอ</label>
                        <input type="text" id="code-${slot.id}" class="w-full p-2 border border-blue-200 rounded text-center font-bold text-blue-800 dark:bg-gray-700 dark:text-blue-300" placeholder="...">
                    </div>
                    ` : `<input type="hidden" id="code-${slot.id}" value="water">`}
                    <div class="${isWater ? 'w-full' : 'w-2/3'} relative">
                        <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">ค่าที่อ่านได้ (หน่วย)</label>
                        <input type="number" step="0.01" id="value-${slot.id}" class="w-full p-2 border border-blue-200 rounded text-center font-bold text-xl text-blue-800 dark:bg-gray-700 dark:text-blue-300" placeholder="รอการวิเคราะห์...">
                        <div id="loading-${slot.id}" class="absolute right-3 top-7 text-blue-500 hidden">
                            <i class="fa-solid fa-spinner fa-spin"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        container.insertAdjacentHTML('beforeend', slotHTML);
    });
}

// 5. AI INTEGRATION
async function handleImage(event, slotId) {
    const file = event.target.files[0];
    if (!file) return;

    const slot = slotsData.find(s => s.id === slotId);
    document.getElementById(`upload-box-${slotId}`).classList.add('hidden');
    document.getElementById(`result-box-${slotId}`).classList.remove('hidden');
    
    const loadingIcon = document.getElementById(`loading-${slotId}`);
    const codeInput = document.getElementById(`code-${slotId}`);
    const valueInput = document.getElementById(`value-${slotId}`);
    
    loadingIcon.classList.remove('hidden');
    if(codeInput && activeMeter.type === 'electric') codeInput.value = '';
    valueInput.value = '';
    valueInput.placeholder = 'กำลังบีบอัด...';

    try {
        const options = { maxSizeMB: 0.1, maxWidthOrHeight: 1024, useWebWorker: true };
        const compressedFile = await imageCompression(file, options);
        
        slot.file = compressedFile;
        document.getElementById(`preview-${slotId}`).src = URL.createObjectURL(compressedFile);

        valueInput.placeholder = 'AI กำลังคิด...';
        const formData = new FormData();
        formData.append('image', compressedFile);

        const response = await fetch('/api/read-meter', { method: 'POST', body: formData });
        const data = await response.json();
        
        loadingIcon.classList.add('hidden');

        if (data.status === 'blurry') {
            alert(`รูปเบลอ หรืออ่านไม่ได้ครับ รบกวนถ่ายช่องนี้ใหม่`);
            valueInput.placeholder = 'อ่านไม่ได้';
        } else if (data.value) {
            if (activeMeter.type === 'electric') {
                codeInput.value = data.code || '';
                slot.code = data.code;
                
                const validCodes = ['010', '011', '012'];
                codeInput.classList.remove('text-red-600', 'bg-red-50', 'border-red-400', 'text-orange-600', 'bg-orange-50', 'border-orange-400');
                
                if (data.code && !validCodes.includes(data.code)) {
                    codeInput.classList.add('text-red-600', 'bg-red-50', 'border-red-400');
                    alert(`⚠️ ผิดพลาด! อ่านรหัสได้ "${data.code}" ซึ่งไม่ใช่ 010, 011 หรือ 012`);
                } else {
                    const isDuplicate = slotsData.some(s => s.id !== slotId && s.code === data.code);
                    if (isDuplicate) {
                        codeInput.classList.add('text-orange-600', 'bg-orange-50', 'border-orange-400');
                        alert(`⚠️ เตือน! คุณถ่ายรูปรหัสซ้ำกับช่องอื่น`);
                    }
                }
            }
            valueInput.value = data.value;
            slot.value = data.value;
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
            valueInput.placeholder = 'ไม่พบเลข';
        }
    } catch (error) {
        console.error('Error', error);
        loadingIcon.classList.add('hidden');
        valueInput.placeholder = 'ข้อผิดพลาด';
    }
}

function retakePhoto(slotId) {
    const slot = slotsData.find(s => s.id === slotId);
    slot.file = null;
    if (activeMeter.type === 'electric') slot.code = '';
    slot.value = '';
    
    document.getElementById(`upload-box-${slotId}`).classList.remove('hidden');
    document.getElementById(`result-box-${slotId}`).classList.add('hidden');
    document.getElementById(`camera-${slotId}`).value = '';
}

// 6. SAVE DATA
async function saveRecord() {
    const recorderName = document.getElementById('recorder-name').value;
    localStorage.setItem('lastRecorder', recorderName);

    slotsData.forEach(slot => {
        const valEl = document.getElementById(`value-${slot.id}`);
        if(valEl) slot.value = valEl.value;
        if(activeMeter.type === 'electric') {
            const codeEl = document.getElementById(`code-${slot.id}`);
            if(codeEl) slot.code = codeEl.value;
        }
    });

    const filledSlots = slotsData.filter(s => s.file);
    if(filledSlots.length === 0) {
        alert("กรุณาถ่ายรูปอย่างน้อย 1 ช่องก่อนกดบันทึกครับ"); return;
    }

    const emptyValues = filledSlots.filter(s => !s.value);
    if(emptyValues.length > 0) {
        alert("มีรูปที่ยังไม่ได้กรอกตัวเลข หรือ AI ประมวลผลไม่เสร็จครับ"); return;
    }

    if (activeMeter.type === 'electric') {
        const collectedCodes = filledSlots.map(s => s.code);
        const uniqueCodes = new Set(collectedCodes);
        if(uniqueCodes.size !== collectedCodes.length) {
            alert("⚠️ เตือน! ถ่ายรหัสหน้าจอซ้ำกัน กรุณาแก้ไขก่อนครับ"); return;
        }
    }

    // เตรียมปุ่มแสดงสถานะโหลด
    const btnSave = document.getElementById('btn-save');
    const originalText = btnSave.innerHTML;
    btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังอัปโหลดข้อมูลขึ้น Cloud...';
    btnSave.disabled = true;

    try {
        const formData = new FormData();
        formData.append('recorderName', recorderName);
        formData.append('meterId', activeMeter.id);
        formData.append('meterType', activeMeter.type);
        
        const recordsToSave = filledSlots.map(s => ({
            code: s.code,
            value: s.value
        }));
        formData.append('records', JSON.stringify(recordsToSave));

        filledSlots.forEach(s => {
            formData.append('images', s.file);
        });

        const response = await fetch('/api/save-data', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if(data.success) {
            // บันทึกลง LocalStorage ด้วย เพื่อให้หน้า Dashboard อัปเดตสถิติทันที
            const now = new Date();
            const newRecord = {
                id: Date.now(),
                date: now.toLocaleDateString('th-TH'),
                time: now.toLocaleTimeString('th-TH'),
                recorder: recorderName,
                meterId: activeMeter.id,
                meterName: activeMeter.name,
                type: activeMeter.type,
                values: filledSlots.map(s => ({ code: s.code, value: s.value }))
            };
            appRecords.unshift(newRecord);
            localStorage.setItem('appRecords', JSON.stringify(appRecords));

            alert(`✅ ${data.message}\nบันทึกไปแล้ว ${data.count} ค่า`);
            showView('dashboard');
        } else {
            alert(`❌ เกิดข้อผิดพลาดจากเซิร์ฟเวอร์: ${data.error}`);
        }
    } catch(e) {
        console.error("Save Error:", e);
        alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่");
    } finally {
        btnSave.innerHTML = originalText;
        btnSave.disabled = false;
    }
}

// 7. HISTORY VIEW
function openHistoryView(filter) {
    const container = document.getElementById('history-container');
    const title = document.getElementById('history-title');
    container.innerHTML = '';
    
    const todayStr = new Date().toLocaleDateString('th-TH');
    
    let displayRecords = appRecords;
    if (filter === 'today') {
        title.innerText = 'ข้อมูลวันนี้ (' + todayStr + ')';
        displayRecords = appRecords.filter(r => r.date === todayStr);
    } else {
        title.innerText = 'ประวัติการจดทั้งหมด';
    }

    if (displayRecords.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-6">ไม่มีข้อมูล</p>';
    } else {
        displayRecords.forEach(r => {
            let valsHtml = r.values.map(v => `<span class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded">${v.code === 'water' ? 'น้ำ' : v.code}: <b>${v.value}</b></span>`).join(' ');
            const html = `
                <div class="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border-l-4 ${r.type === 'electric' ? 'border-yellow-500' : 'border-blue-500'} mb-3">
                    <div class="flex justify-between items-start mb-1">
                        <span class="font-bold text-gray-800 dark:text-gray-200 text-sm">${r.meterName}</span>
                        <span class="text-xs text-gray-400">${r.date} ${r.time}</span>
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 mb-2"><i class="fa-regular fa-user mr-1"></i>${r.recorder}</div>
                    <div class="flex flex-wrap gap-1">${valsHtml}</div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    }
    showView('history');
}

// 8. ADMIN LOGIN & PANEL
function openAdminLogin() {
    document.getElementById('admin-pin').value = '';
    showView('admin-login');
}

function loginAdmin() {
    if (document.getElementById('admin-pin').value === '1234') {
        renderAdminSettings();
        showView('admin');
    } else {
        alert('รหัสผ่านไม่ถูกต้อง');
    }
}

function renderAdminSettings() {
    const rl = document.getElementById('admin-recorders-list');
    rl.innerHTML = appRecorders.map((r, i) => `
        <li class="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded border dark:border-gray-600">
            <span class="dark:text-gray-200">${r}</span>
            <button onclick="removeRecorder(${i})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
        </li>
    `).join('');

    const ml = document.getElementById('admin-meters-list');
    ml.innerHTML = appMeters.map((m, i) => `
        <li class="bg-gray-50 dark:bg-gray-700 p-3 rounded border dark:border-gray-600 mb-2">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <div class="font-bold text-sm dark:text-white">${m.name}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">รหัส: ${m.id} | ประเภท: ${m.type === 'electric' ? 'ไฟฟ้า' : 'ประปา'}</div>
                </div>
                <button onclick="removeMeter(${i})" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
            </div>
            <button onclick="generateQRCode('${m.id}', '${m.name}')" class="w-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 py-1 rounded text-sm font-medium hover:bg-blue-200 transition">
                <i class="fa-solid fa-qrcode mr-1"></i> สร้าง QR Code
            </button>
        </li>
    `).join('');
}

function addRecorder() {
    const v = document.getElementById('new-recorder').value.trim();
    if(v && !appRecorders.includes(v)) {
        appRecorders.push(v);
        localStorage.setItem('appRecorders', JSON.stringify(appRecorders));
        document.getElementById('new-recorder').value = '';
        renderAdminSettings();
    }
}
function removeRecorder(i) { appRecorders.splice(i, 1); localStorage.setItem('appRecorders', JSON.stringify(appRecorders)); renderAdminSettings(); }

function addMeter() {
    const id = document.getElementById('new-meter-id').value.trim();
    const name = document.getElementById('new-meter-name').value.trim();
    const type = document.getElementById('new-meter-type').value;
    if(id && name) {
        if(appMeters.find(m => m.id === id)) return alert('รหัสจุดซ้ำ!');
        appMeters.push({id, name, type});
        localStorage.setItem('appMeters', JSON.stringify(appMeters));
        document.getElementById('new-meter-id').value = ''; document.getElementById('new-meter-name').value = '';
        renderAdminSettings();
    } else { alert('กรอกข้อมูลให้ครบ'); }
}
function removeMeter(i) { appMeters.splice(i, 1); localStorage.setItem('appMeters', JSON.stringify(appMeters)); renderAdminSettings(); }

function clearHistoryData() {
    if(confirm('ยืนยันล้างประวัติการจดทั้งหมด?')) {
        appRecords = []; localStorage.setItem('appRecords', JSON.stringify([])); alert('ล้างประวัติเรียบร้อย');
    }
}

// 9. QR CODE & BOOTSTRAP
function generateQRCode(id, name) {
    document.getElementById('modal-qr').classList.remove('hidden');
    document.getElementById('qr-title').innerText = `QR Code: ${name}`;
    document.getElementById('qrcode-render').innerHTML = '';
    
    new QRCode(document.getElementById('qrcode-render'), {
        text: window.location.origin + window.location.pathname + '?meter=' + id,
        width: 200, height: 200, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H
    });
}
function closeQRModal() { document.getElementById('modal-qr').classList.add('hidden'); }

// เริ่มทำงานเมื่อเปิดหน้าเว็บ
window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    updateDashboardStats();

    // In-App Browser Detect
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    if (ua.indexOf("Line") > -1 || ua.indexOf("FBAN") > -1 || ua.indexOf("FBAV") > -1 || ua.indexOf("Instagram") > -1) {
        document.getElementById('inapp-warning').classList.remove('hidden');
    }

    document.getElementById('btn-open-external').addEventListener('click', () => {
        if (ua.indexOf("Line") > -1) {
            let newUrl = window.location.href;
            newUrl += (newUrl.indexOf('?') > -1) ? '&openExternalBrowser=1' : '?openExternalBrowser=1';
            window.location.href = newUrl;
        } else {
            alert('กรุณากดที่เมนูมุมขวาบน แล้วเลือก "เปิดด้วยเบราว์เซอร์เริ่มต้น"');
        }
    });

    // Auto-select from QR
    const meterParam = new URLSearchParams(window.location.search).get('meter');
    if (meterParam) {
        openRecordView();
        setTimeout(() => {
            const sel = document.getElementById('meter-type');
            if(sel.querySelector(`option[value="${meterParam}"]`)) {
                sel.value = meterParam; handleMeterSelection();
            }
        }, 100);
    }
});
