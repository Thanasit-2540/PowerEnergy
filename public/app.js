let appMeters = [];
let appRecorders = [];
let activeMeter = null;
let photoSlots = []; // Array to store { code: '010', file: File }

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    
    // Check QR param
    const meterParam = new URLSearchParams(window.location.search).get('meter');
    if (meterParam) {
        document.getElementById('meter-select').value = meterParam;
        onMeterSelect();
    }
});

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        if (json.success) {
            appMeters = json.meters;
            appRecorders = json.recorders;

            const mSelect = document.getElementById('meter-select');
            appMeters.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = `${m.name} (${m.type === 'electric' ? 'ไฟฟ้า' : 'ประปา'})`;
                mSelect.appendChild(opt);
            });

            const rSelect = document.getElementById('recorder-select');
            appRecorders.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r;
                opt.textContent = r;
                rSelect.appendChild(opt);
            });
            
            // Try load last recorder
            const savedRecorder = localStorage.getItem('lastRecorder');
            if (savedRecorder && appRecorders.includes(savedRecorder)) {
                rSelect.value = savedRecorder;
            }

            document.getElementById('loading-settings').classList.add('hidden');
            document.getElementById('form-container').classList.remove('hidden');
            
            mSelect.addEventListener('change', onMeterSelect);
            rSelect.addEventListener('change', (e) => localStorage.setItem('lastRecorder', e.target.value));
        }
    } catch (e) {
        alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณารีเฟรชหน้าเว็บ');
    }
}

function onMeterSelect() {
    const meterId = document.getElementById('meter-select').value;
    activeMeter = appMeters.find(m => m.id === meterId);
    if (!activeMeter) return;

    const info = document.getElementById('meter-info');
    info.textContent = `ประเภท: ${activeMeter.type === 'electric' ? 'มิเตอร์ไฟฟ้า' : 'มิเตอร์น้ำ'}`;
    info.classList.remove('hidden');

    renderCameraSlots();
}

function renderCameraSlots() {
    const container = document.getElementById('camera-slots');
    container.innerHTML = '';
    photoSlots = [];

    const slotCodes = activeMeter.type === 'electric' ? ['010', '011', '012'] : ['water'];

    slotCodes.forEach(code => {
        photoSlots.push({ code, file: null });
        
        const labelText = activeMeter.type === 'electric' ? `หน้าจอเลข ${code}` : `หน้าปัดมิเตอร์น้ำ`;
        
        container.innerHTML += `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow border border-gray-200 dark:border-gray-700">
                <div class="font-bold text-gray-700 dark:text-gray-300 mb-2">
                    <i class="fa-solid fa-image text-blue-500 mr-2"></i>ถ่ายรูป: ${labelText}
                </div>
                <div class="relative w-full h-48 bg-gray-100 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden cursor-pointer" onclick="document.getElementById('file-${code}').click()">
                    <div id="placeholder-${code}" class="text-gray-400 flex flex-col items-center">
                        <i class="fa-solid fa-camera fa-2x mb-2"></i>
                        <span>แตะเพื่อถ่ายรูป</span>
                    </div>
                    <img id="preview-${code}" class="absolute inset-0 w-full h-full object-cover hidden" />
                    <input type="file" id="file-${code}" accept="image/*" capture="environment" class="hidden" onchange="handleFile(event, '${code}')">
                </div>
            </div>
        `;
    });

    document.getElementById('camera-section').classList.remove('hidden');
}

async function handleFile(event, code) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const placeholder = document.getElementById(`placeholder-${code}`);
        placeholder.innerHTML = '<i class="fa-solid fa-spinner fa-spin fa-2x"></i>';

        const options = { maxSizeMB: 0.2, maxWidthOrHeight: 1280, useWebWorker: true };
        const compressedFile = await imageCompression(file, options);
        
        const slot = photoSlots.find(s => s.code === code);
        slot.file = compressedFile;

        const preview = document.getElementById(`preview-${code}`);
        preview.src = URL.createObjectURL(compressedFile);
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } catch(e) {
        alert('เกิดข้อผิดพลาดในการประมวลผลรูป');
    }
}

async function submitPhotos() {
    const recorder = document.getElementById('recorder-select').value;
    if (!activeMeter || !recorder) return alert('กรุณาเลือกจุดมิเตอร์และชื่อผู้จด');

    // ตรวจสอบว่าถ่ายรูปครบไหม
    const missingPhotos = photoSlots.filter(s => !s.file);
    if (missingPhotos.length > 0) {
        return alert(`กรุณาถ่ายรูปให้ครบทุกช่อง (ขาดอีก ${missingPhotos.length} รูป)`);
    }

    const btn = document.getElementById('btn-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังส่งรูปขึ้นระบบ...';
    btn.disabled = true;

    const statusMsg = document.getElementById('status-message');
    statusMsg.classList.add('hidden');
    statusMsg.className = 'text-center font-bold text-lg mt-4'; // Reset classes
    
    try {
        const formData = new FormData();
        formData.append('recorderName', recorder);
        formData.append('meterId', activeMeter.id);
        formData.append('meterType', activeMeter.type);
        
        const slotCodes = photoSlots.map(s => s.code);
        formData.append('slots', JSON.stringify(slotCodes));

        photoSlots.forEach(s => {
            formData.append('images', s.file, `${s.code}.jpg`);
        });

        const res = await fetch('/api/save-photos', { method: 'POST', body: formData });
        const json = await res.json();

        if (json.success) {
            statusMsg.textContent = '✅ ' + json.message;
            statusMsg.classList.add('text-green-500');
            statusMsg.classList.remove('hidden');
            
            // รอ 2 วินาทีแล้วรีเซ็ตหน้าจอใหม่
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            statusMsg.textContent = '❌ เกิดข้อผิดพลาด: ' + json.error;
            statusMsg.classList.add('text-red-500');
            statusMsg.classList.remove('hidden');
        }
    } catch (e) {
        statusMsg.textContent = '❌ เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
        statusMsg.classList.add('text-red-500');
        statusMsg.classList.remove('hidden');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
