// js/app.js
// แกนหลักการทำงานของแอป (UI State, Camera, AI Logic)

// ==========================================
// 1. DATA STATE (ดึงจาก Supabase ผ่าน Server)
// ==========================================
let appRecorders = [];
let appMeters = [];

async function loadSettings() {
    console.log('📡 loadSettings: กำลังดึงข้อมูลจาก /api/settings...');
    try {
        const res = await fetch('/api/settings');
        console.log('📡 loadSettings: HTTP status =', res.status);
        const json = await res.json();
        console.log('📡 loadSettings: ข้อมูลที่ได้จาก Server =', JSON.stringify(json));
        
        if (json.success) {
            appMeters = json.meters || [];
            appRecorders = json.recorders || [];
            console.log('✅ loadSettings: โหลดสำเร็จ! meters =', appMeters.length, 'recorders =', appRecorders.length);
        } else {
            console.error('❌ loadSettings: Server ตอบ success=false', json.error);
        }
    } catch(e) {
        console.error('❌ loadSettings: ล้มเหลว', e);
    }
}
let appRecords = [];

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
// 3. DASHBOARD STATS & TABLE
// ==========================================
async function updateDashboardStats() {
    try {
        const tbody = document.getElementById('dashboard-table-body');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังดึงข้อมูลจาก Cloud...</td></tr>';

        const res = await fetch('/api/get-records');
        const json = await res.json();
        
        if (!json.success) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-500">Error: ${json.error}</td></tr>`;
            return;
        }

        const records = json.data;
        const now = new Date();
        // แปลงวันที่แบบ th-TH ให้เหมือนกับที่บันทึกในฐานข้อมูล (YYYY-MM-DD) หรือเช็คจาก Date object
        const todayStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format commonly used for date comparison
        
        // ข้อมูลทั้งหมด (จาก localStorage ชั่วคราว หรือถ้ามีใน db ก็เช็คจากที่จด)
        const totalElec = appMeters.filter(m => m.type === 'electric').length;
        const totalWater = appMeters.filter(m => m.type === 'water').length;
        
        // ข้อมูลที่จดวันนี้แล้ว
        const todayRecords = records.filter(r => {
            const rDate = new Date(r.created_at).toLocaleDateString('en-CA');
            return rDate === todayStr;
        });
        
        // นับจำนวนจุดที่ไม่ซ้ำที่จดไปแล้ววันนี้
        const elecDoneIds = new Set(todayRecords.filter(r => r.meter_type === 'electric' || r['010']).map(r => r["House Number"]));
        const waterDoneIds = new Set(todayRecords.filter(r => r.meter_type === 'water' || r.water_value).map(r => r["House Number"]));
        
        const elecDone = elecDoneIds.size;
        const waterDone = waterDoneIds.size;
        
        document.getElementById('stat-elec-done').innerText = elecDone;
        document.getElementById('stat-elec-pending').innerText = Math.max(0, totalElec - elecDone);
        document.getElementById('stat-water-done').innerText = waterDone;
        document.getElementById('stat-water-pending').innerText = Math.max(0, totalWater - waterDone);

        // Render Table
        if (todayRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">ยังไม่มีข้อมูลการจดมิเตอร์ของวันนี้</td></tr>';
        } else {
            let html = '';
            todayRecords.forEach(r => {
                const dateObj = new Date(r.created_at);
                const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const isElec = r['010'] !== undefined;
                
                let valuesHtml = '';
                let imagesHtml = '';
                
                if (isElec) {
                    // ไฟฟ้า
                    valuesHtml = `
                        <div class="text-xs space-y-1">
                            ${r['010'] ? `<div class="bg-blue-50 text-blue-700 px-2 rounded border border-blue-200">010: <b>${r['010']}</b></div>` : ''}
                            ${r['011'] ? `<div class="bg-blue-50 text-blue-700 px-2 rounded border border-blue-200">011: <b>${r['011']}</b></div>` : ''}
                            ${r['012'] ? `<div class="bg-blue-50 text-blue-700 px-2 rounded border border-blue-200">012: <b>${r['012']}</b></div>` : ''}
                        </div>`;
                    imagesHtml = `
                        <div class="flex space-x-1 justify-center">
                            ${r['IMG010'] ? `<a href="${r['IMG010']}" target="_blank"><img src="${r['IMG010']}" class="w-8 h-8 object-cover rounded cursor-pointer border hover:scale-150 transition transform"></a>` : ''}
                            ${r['IMG011'] ? `<a href="${r['IMG011']}" target="_blank"><img src="${r['IMG011']}" class="w-8 h-8 object-cover rounded cursor-pointer border hover:scale-150 transition transform"></a>` : ''}
                            ${r['IMG012'] ? `<a href="${r['IMG012']}" target="_blank"><img src="${r['IMG012']}" class="w-8 h-8 object-cover rounded cursor-pointer border hover:scale-150 transition transform"></a>` : ''}
                        </div>`;
                } else {
                    // ประปา
                    valuesHtml = `<div class="bg-cyan-50 text-cyan-700 px-2 rounded border border-cyan-200 text-xs inline-block">ค่าน้ำ: <b>${r.water_value}</b></div>`;
                    imagesHtml = r.water_img ? `<a href="${r.water_img}" target="_blank"><img src="${r.water_img}" class="w-8 h-8 object-cover rounded cursor-pointer border hover:scale-150 transition transform mx-auto"></a>` : '';
                }

                html += `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                        <td class="px-4 py-3 border-b dark:border-gray-700">
                            <div class="font-medium text-gray-800 dark:text-gray-200">${timeStr}</div>
                            <div class="text-xs text-gray-500"><i class="fa-solid fa-user text-[10px] mr-1"></i>${r.recorder_name}</div>
                        </td>
                        <td class="px-4 py-3 border-b dark:border-gray-700">
                            ${isElec 
                                ? `<span class="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold rounded-full mb-1"><i class="fa-solid fa-bolt mr-1"></i>ไฟฟ้า</span>`
                                : `<span class="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full mb-1"><i class="fa-solid fa-droplet mr-1"></i>ประปา</span>`
                            }
                            <div class="font-bold text-gray-700 dark:text-gray-300 text-xs">${r['House Number'] || '-'}</div>
                        </td>
                        <td class="px-4 py-2 border-b dark:border-gray-700 align-middle">
                            ${valuesHtml}
                        </td>
                        <td class="px-4 py-3 border-b dark:border-gray-700 text-center align-middle">
                            ${imagesHtml}
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }

    } catch (e) {
        console.error(e);
        document.getElementById('dashboard-table-body').innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
    }
}

// ==========================================
// 4. DYNAMIC RECORDING FORM (QR CODE ONLY)
// ==========================================
function startRecordingFromQR(meterId) {
    activeMeter = appMeters.find(m => m.id === meterId);
    
    if (!activeMeter) {
        alert('ไม่พบข้อมูลจุดมิเตอร์นี้ในระบบ หรือ QR Code ไม่ถูกต้องครับ');
        showView('dashboard');
        return;
    }

    // เตรียม Dropdown พนักงาน
    const recSelect = document.getElementById('recorder-name');
    recSelect.innerHTML = appRecorders.map(r => `<option value="${r}">${r}</option>`).join('');
    recSelect.value = localStorage.getItem('lastRecorder') || appRecorders[0];
    
    // อัปเดตข้อมูลบนหน้าจอ (ให้อ่านอย่างเดียว)
    document.getElementById('display-meter-name').innerText = activeMeter.name;
    const isElectric = activeMeter.type === 'electric';
    document.getElementById('display-meter-type').innerHTML = isElectric ? '<i class="fa-solid fa-bolt text-yellow-300 mr-1"></i> ไฟฟ้า' : '<i class="fa-solid fa-droplet text-blue-300 mr-1"></i> ประปา';
    document.getElementById('display-meter-type').className = isElectric ? 'bg-indigo-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-md' : 'bg-cyan-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-md';

    // เตรียมช่องถ่ายรูป
    if (isElectric) {
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
    showView('record');
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

// ==========================================
// 9. ADMIN & QR CODE
// ==========================================
function openAdminLogin() {
    showView('admin-login');
}

async function checkOldDataCount() {
    const countEl = document.getElementById('old-data-count');
    countEl.innerText = '...';
    try {
        const res = await fetch('/api/count-old-data?days=15');
        const json = await res.json();
        if (json.success) {
            countEl.innerText = json.count + " รายการ";
        } else {
            countEl.innerText = "Error";
        }
    } catch(e) {
        countEl.innerText = "Error";
    }
}

async function loginAdmin() {
    const pinInput = document.getElementById('admin-pin');
    const pin = pinInput.value;
    if (!pin) return alert('กรุณาใส่รหัสผ่าน');

    // แจ้งสถานะกำลังตรวจสอบ
    const originalPlaceholder = pinInput.placeholder;
    pinInput.placeholder = "กำลังตรวจสอบ...";
    pinInput.disabled = true;
    
    try {
        const res = await fetch('/api/verify-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pin })
        });
        const json = await res.json();
        
        if (json.success) {
            showView('admin-dashboard');
            renderAdminSettings();
            checkOldDataCount(); // โหลดจำนวนข้อมูลขยะ
            pinInput.value = '';
        } else {
            alert('รหัสผ่านไม่ถูกต้อง');
        }
    } catch(e) {
        console.error(e);
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
        pinInput.placeholder = originalPlaceholder;
        pinInput.disabled = false;
    }
}

async function renderAdminSettings() {
    console.log('🔄 renderAdminSettings: เริ่มทำงาน...');
    
    // โหลดข้อมูลล่าสุดจากฐานข้อมูลก่อน
    await loadSettings();
    
    console.log('🔄 renderAdminSettings: appRecorders =', appRecorders);
    console.log('🔄 renderAdminSettings: appMeters =', appMeters);

    // แสดงรายชื่อพนักงาน
    const rl = document.getElementById('admin-recorders-list');
    if (appRecorders.length === 0) {
        rl.innerHTML = '<p class="text-center text-gray-400 py-4">ยังไม่มีข้อมูลพนักงาน</p>';
    } else {
        rl.innerHTML = appRecorders.map((r, i) => `
            <li class="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded border dark:border-gray-600">
                <span class="dark:text-gray-200">${r}</span>
                <button onclick="removeRecorder('${r}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
            </li>
        `).join('');
    }

    // แสดงรายชื่อจุดมิเตอร์
    const ml = document.getElementById('admin-meters-list');
    if (appMeters.length === 0) {
        ml.innerHTML = '<p class="text-center text-gray-400 py-4">ยังไม่มีจุดมิเตอร์</p>';
    } else {
        ml.innerHTML = appMeters.map((m, i) => `
            <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded border dark:border-gray-600 mb-2">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="font-bold text-sm dark:text-white">${m.name}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">รหัส: ${m.id} | ประเภท: ${m.type === 'electric' ? 'ไฟฟ้า' : 'ประปา'}</div>
                    </div>
                    <button onclick="removeMeter('${m.id}')" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
                </div>
                <button onclick="generateQRCode('${m.id}', '${m.name}')" class="w-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 py-1 rounded text-sm font-medium hover:bg-blue-200 transition">
                    <i class="fa-solid fa-qrcode mr-1"></i> สร้าง QR Code
                </button>
            </div>
        `).join('');
    }

    // เติมข้อมูลจุดมิเตอร์ลงใน Dropdown สำหรับแก้ไขข้อมูลย้อนหลัง
    const editMeterSelect = document.getElementById('edit-meter');
    if (editMeterSelect) {
        editMeterSelect.innerHTML = appMeters.map(m => `
            <option value="${m.id}">${m.name} (${m.type === 'electric' ? 'ไฟฟ้า' : 'ประปา'})</option>
        `).join('');
    }
    
    console.log('✅ renderAdminSettings: แสดงผลเสร็จสิ้น');
}

// เพิ่มพนักงาน
async function adminAddRecorder() {
    const input = document.getElementById('admin-new-recorder');
    const name = input.value.trim();
    if (!name) return alert('กรุณาพิมพ์ชื่อพนักงาน');
    if (appRecorders.includes(name)) return alert('ชื่อนี้มีในระบบแล้ว');

    try {
        const res = await fetch('/api/settings/add-recorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const json = await res.json();
        console.log('เพิ่มพนักงาน:', json);
        if (!json.success) alert('เพิ่มไม่สำเร็จ: ' + json.error);
        input.value = '';
        await renderAdminSettings();
    } catch(e) {
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

// ลบพนักงาน (ส่งชื่อตรงๆ ไม่ใช้ index)
async function removeRecorder(name) {
    if (!confirm('ลบพนักงาน "' + name + '" ออกจากระบบ?')) return;
    try {
        const res = await fetch('/api/settings/delete-recorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const json = await res.json();
        console.log('ลบพนักงาน:', json);
        await renderAdminSettings();
    } catch(e) {
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

// เพิ่มจุดมิเตอร์
async function adminAddMeter() {
    const id = document.getElementById('admin-meter-id').value.trim();
    const name = document.getElementById('admin-meter-name').value.trim();
    const type = document.getElementById('admin-meter-type').value;
    if (!id || !name) return alert('กรอกข้อมูลให้ครบ');
    if (appMeters.find(m => m.id === id)) return alert('รหัสจุดซ้ำ!');

    try {
        const res = await fetch('/api/settings/add-meter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, type })
        });
        const json = await res.json();
        console.log('เพิ่มมิเตอร์:', json);
        if (!json.success) alert('เพิ่มไม่สำเร็จ: ' + json.error);
        document.getElementById('admin-meter-id').value = '';
        document.getElementById('admin-meter-name').value = '';
        await renderAdminSettings();
    } catch(e) {
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

// ลบจุดมิเตอร์ (ส่ง id ตรงๆ ไม่ใช้ index)
async function removeMeter(id) {
    if (!confirm('ลบจุดมิเตอร์ "' + id + '" ออกจากระบบ?')) return;
    try {
        const res = await fetch('/api/settings/delete-meter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const json = await res.json();
        console.log('ลบมิเตอร์:', json);
        await renderAdminSettings();
    } catch(e) {
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

function clearHistoryData() {
    if(confirm('ยืนยันล้างประวัติการจดทั้งหมด?')) {
        appRecords = []; localStorage.setItem('appRecords', JSON.stringify([])); alert('ล้างประวัติเรียบร้อย');
    }
}

// ==========================================
// 9. ADMIN & QR CODE
// ==========================================
function generateQRCode(id, name) {
    document.getElementById('modal-qr').classList.remove('hidden');
    
    // หาว่าเป็นมิเตอร์ประเภทอะไร
    const meter = appMeters.find(m => m.id === id);
    const isElec = meter && meter.type === 'electric';
    const typeText = isElec ? '⚡ ไฟฟ้า (လျှပ်စစ်)' : '💧 ประปา (ရေ)';

    // นำข้อมูลไปใส่ในป้าย
    document.getElementById('qr-display-name').innerText = name;
    document.getElementById('qr-display-id').innerText = id;
    document.getElementById('qr-display-type').innerText = typeText;
    
    // สร้าง QR
    document.getElementById('qrcode-render').innerHTML = '';
    new QRCode(document.getElementById('qrcode-render'), {
        text: window.location.origin + window.location.pathname + '?meter=' + id,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}

function closeQRModal() {
    document.getElementById('modal-qr').classList.add('hidden');
}

async function deleteOldData(days) {
    if(!confirm(`ยืนยันการลบข้อมูลและรูปภาพที่อายุเกิน ${days} วัน?\n*คำเตือน: ข้อมูลจะถูกลบออกจากฐานข้อมูลและไม่สามารถกู้คืนได้`)) return;
    
    try {
        const res = await fetch('/api/delete-old-data', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ days })
        });
        const json = await res.json();
        
        if (json.success) {
            alert(json.message + ` (ลบไปทั้งหมด ${json.deletedCount} รายการ)`);
            updateDashboardStats(); // อัปเดตตารางหน้าแรก
            checkOldDataCount(); // อัปเดตตัวเลขหน้า Admin
        } else {
            alert('เกิดข้อผิดพลาด: ' + json.error);
        }
    } catch(e) {
        console.error(e);
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

// ==========================================
// 10. EDIT & ADD PAST DATA (ADMIN)
// ==========================================
function toggleMeterList() {
    const container = document.getElementById('meter-list-container');
    const btn = document.getElementById('btn-toggle-meter-list');
    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        btn.innerHTML = '<i class="fa-solid fa-chevron-up mr-1"></i> ซ่อนรายการ';
    } else {
        container.classList.add('hidden');
        btn.innerHTML = '<i class="fa-solid fa-chevron-down mr-1"></i> แสดงรายการ';
    }
}

async function fetchRecordForEdit() {
    const date = document.getElementById('edit-date').value;
    const meterId = document.getElementById('edit-meter').value;
    if(!date || !meterId) return alert('กรุณาเลือกวันที่และจุดมิเตอร์');
    
    const meter = appMeters.find(m => m.id === meterId);
    
    document.getElementById('edit-form-container').classList.add('hidden');
    document.getElementById('edit-not-found').classList.add('hidden');
    
    try {
        const res = await fetch(`/api/get-single-record?date=${date}&meterId=${meterId}&type=${meter.type}`);
        const json = await res.json();
        if(json.success && json.data) {
            const r = json.data;
            document.getElementById('edit-form-container').classList.remove('hidden');
            
            document.getElementById('edit-record-id').value = r.id;
            document.getElementById('edit-record-type').value = meter.type;
            
            const recSelect = document.getElementById('edit-recorder-name');
            recSelect.innerHTML = appRecorders.map(x => `<option value="${x}">${x}</option>`).join('');
            recSelect.value = r.recorder_name || appRecorders[0];
            
            const t = new Date(r.created_at).toLocaleTimeString('th-TH');
            document.getElementById('edit-form-time').innerText = 'เวลาที่จด: ' + t;
            document.getElementById('edit-form-title').innerText = `แก้ไขข้อมูล: ${meter.name}`;
            
            if(meter.type === 'electric') {
                document.getElementById('edit-electric-fields').classList.remove('hidden');
                document.getElementById('edit-water-fields').classList.add('hidden');
                document.getElementById('edit-val-010').value = r['010'] || '';
                document.getElementById('edit-val-011').value = r['011'] || '';
                document.getElementById('edit-val-012').value = r['012'] || '';
            } else {
                document.getElementById('edit-electric-fields').classList.add('hidden');
                document.getElementById('edit-water-fields').classList.remove('hidden');
                document.getElementById('edit-val-water').value = r.water_value || '';
            }
        } else {
            // ไม่พบข้อมูล
            document.getElementById('edit-not-found').classList.remove('hidden');
        }
    } catch(e) {
        alert('เกิดข้อผิดพลาดในการดึงข้อมูล');
    }
}

function setupAddMissingRecord() {
    const meterId = document.getElementById('edit-meter').value;
    const meter = appMeters.find(m => m.id === meterId);
    
    document.getElementById('edit-not-found').classList.add('hidden');
    document.getElementById('edit-form-container').classList.remove('hidden');
    
    document.getElementById('edit-record-id').value = ''; // ว่างไว้เพื่อบอกว่าเป็นการ Insert ใหม่
    document.getElementById('edit-record-type').value = meter.type;
    
    const recSelect = document.getElementById('edit-recorder-name');
    recSelect.innerHTML = appRecorders.map(x => `<option value="${x}">${x}</option>`).join('');
    recSelect.value = appRecorders[0];
    
    document.getElementById('edit-form-time').innerText = 'ระบบจะใช้เวลาปัจจุบัน';
    document.getElementById('edit-form-title').innerText = `เพิ่มข้อมูลใหม่: ${meter.name}`;
    
    if(meter.type === 'electric') {
        document.getElementById('edit-electric-fields').classList.remove('hidden');
        document.getElementById('edit-water-fields').classList.add('hidden');
        document.getElementById('edit-val-010').value = '';
        document.getElementById('edit-val-011').value = '';
        document.getElementById('edit-val-012').value = '';
    } else {
        document.getElementById('edit-electric-fields').classList.add('hidden');
        document.getElementById('edit-water-fields').classList.remove('hidden');
        document.getElementById('edit-val-water').value = '';
    }
}

async function saveEditRecord() {
    const id = document.getElementById('edit-record-id').value;
    const type = document.getElementById('edit-record-type').value;
    const meterId = document.getElementById('edit-meter').value; // จำเป็นสำหรับกรณี insert ใหม่
    const recorder = document.getElementById('edit-recorder-name').value;
    
    let updates = { recorder_name: recorder };
    if (type === 'electric') {
        updates['010'] = document.getElementById('edit-val-010').value || null;
        updates['011'] = document.getElementById('edit-val-011').value || null;
        updates['012'] = document.getElementById('edit-val-012').value || null;
    } else {
        updates['water_value'] = document.getElementById('edit-val-water').value || null;
    }
    
    try {
        const res = await fetch('/api/update-record', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id, type, updates, meterId })
        });
        const json = await res.json();
        if(json.success) {
            alert('บันทึกข้อมูลเรียบร้อยแล้ว!');
            document.getElementById('edit-form-container').classList.add('hidden');
            updateDashboardStats(); // อัปเดตตารางหน้าแรก
        } else {
            alert('Error: ' + json.error);
        }
    } catch(e) {
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
}

// เริ่มทำงานเมื่อเปิดหน้าเว็บ
window.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    updateDashboardStats();

    // รอโหลดข้อมูลมิเตอร์จากเซิร์ฟเวอร์ก่อน
    await loadSettings();

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
        startRecordingFromQR(meterParam);
    }
});
