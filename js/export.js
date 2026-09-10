// js/export.js
// ระบบส่งออกข้อมูล Excel และบีบอัดไฟล์ Zip

// ฟังก์ชันหลักสำหรับดาวน์โหลดข้อมูล
async function exportData() {
    const startDate = document.getElementById('export-start-date').value;
    const endDate = document.getElementById('export-end-date').value;

    if (!startDate || !endDate) {
        alert('กรุณาเลือกช่วงเวลาให้ครบถ้วน');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        alert('วันที่เริ่มต้น ต้องไม่เกิน วันที่สิ้นสุด');
        return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // ดึงข้อมูลทั้งหมดจาก LocalStorage
    const appRecords = JSON.parse(localStorage.getItem('appRecords')) || [];
    
    // กรองข้อมูลตามช่วงวันที่เลือก
    const filteredRecords = appRecords.filter(r => {
        // แปลงวันที่แบบ th-TH (DD/MM/YYYY) เป็น Date Object เพื่อเทียบ
        const [day, month, year] = r.date.split('/');
        const recordDate = new Date(`${year}-${month}-${day}`);
        return recordDate >= start && recordDate <= end;
    });

    if (filteredRecords.length === 0) {
        alert('ไม่พบข้อมูลในช่วงเวลาที่เลือกครับ');
        return;
    }

    // จัดกลุ่มข้อมูลตามวันที่
    const recordsByDate = {};
    filteredRecords.forEach(r => {
        if (!recordsByDate[r.date]) {
            recordsByDate[r.date] = [];
        }
        recordsByDate[r.date].push(r);
    });

    const dates = Object.keys(recordsByDate);

    // หากโหลดข้อมูลแค่วันเดียว หรือมีแค่วันเดียว สร้าง Excel ไฟล์เดียว
    if (dates.length === 1) {
        const dateKey = dates[0];
        const wb = createExcelWorkbook(recordsByDate[dateKey]);
        const fileName = `Meter_Data_${dateKey.replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        alert(`ดาวน์โหลดไฟล์ ${fileName} สำเร็จ!`);
    } 
    // หากโหลดหลายวัน สร้างไฟล์ Excel แยกรายวัน แล้วบีบเป็น Zip
    else {
        const zip = new JSZip();
        
        dates.forEach(dateKey => {
            const wb = createExcelWorkbook(recordsByDate[dateKey]);
            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const fileName = `Meter_Data_${dateKey.replace(/\//g, '-')}.xlsx`;
            zip.file(fileName, excelBuffer);
        });

        const zipContent = await zip.generateAsync({ type: "blob" });
        const zipFileName = `Meter_Export_${startDate}_to_${endDate}.zip`;
        saveAs(zipContent, zipFileName);
        alert(`บีบอัดข้อมูลแยกรายวัน และดาวน์โหลดไฟล์ ${zipFileName} สำเร็จ!`);
    }
}

// ฟังก์ชันสร้าง Workbook (โครงสร้างไฟล์ Excel) จากข้อมูล
function createExcelWorkbook(records) {
    // กำหนดโครงสร้างคอลัมน์ของ Excel (10 คอลัมน์ ตามที่ออกแบบไว้)
    const excelData = records.map(r => {
        const row = {
            'วันที่': r.date,
            'เวลา': r.time,
            'พนักงาน': r.recorder,
            'จุดมิเตอร์': r.meterName,
            'ประเภท': r.type === 'electric' ? 'ไฟฟ้า' : 'น้ำ',
            '010 (kW)': '',
            '011 (kvarh)': '',
            '012 (kVA)': '',
            'ประปา (ลบ.ม.)': ''
        };

        // เติมค่าจากที่จดมา
        r.values.forEach(v => {
            if (v.code === '010') row['010 (kW)'] = v.value;
            if (v.code === '011') row['011 (kvarh)'] = v.value;
            if (v.code === '012') row['012 (kVA)'] = v.value;
            if (v.code === 'water') row['ประปา (ลบ.ม.)'] = v.value;
        });

        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Meter Data");
    
    return workbook;
}
