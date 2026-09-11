import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// 1. Worker API: Upload Photos
// ==========================================
app.post('/api/save-photos', upload.array('images', 3), async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase URL/Key missing' });

        const { recorderName, meterId, meterType, slots } = req.body;
        const parsedSlots = JSON.parse(slots); // Array of code (e.g. '010')
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }

        let updateData = {
            "recorder_name": recorderName,
            "House Number": meterId
        };

        // Upload images
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const slotCode = parsedSlots[i];
            
            const fileExt = file.mimetype.split('/')[1] || 'jpg';
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${meterId}/${fileName}`;

            const { error: uploadError } = await supabase
                .storage
                .from('meter_images')
                .upload(filePath, file.buffer, { contentType: file.mimetype });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('meter_images').getPublicUrl(filePath);
            const imageUrl = publicUrlData.publicUrl;

            if (meterType === 'electric') {
                updateData[`IMG${slotCode}`] = imageUrl;
            } else {
                updateData['water_img'] = imageUrl;
            }
        }

        const tableName = meterType === 'electric' ? 'electric_readings' : 'water_readings';
        
        // Check for existing same-day record
        const todayTH = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Bangkok'});
        const startOfDay = new Date(`${todayTH}T00:00:00+07:00`).toISOString();
        const endOfDay = new Date(`${todayTH}T23:59:59.999+07:00`).toISOString();

        const { data: existingData, error: findErr } = await supabase
            .from(tableName)
            .select('id')
            .eq('House Number', meterId)
            .gte('created_at', startOfDay)
            .lt('created_at', endOfDay)
            .order('created_at', { ascending: false })
            .limit(1);

        if (existingData && existingData.length > 0) {
            // Update existing (Reshoot logic)
            updateData.created_at = new Date().toISOString(); // Refresh timestamp
            const { error: dbError } = await supabase
                .from(tableName)
                .update(updateData)
                .eq('id', existingData[0].id);
            if (dbError) throw dbError;
            res.json({ success: true, message: 'บันทึกรูปถ่ายซ้ำสำเร็จ' });
        } else {
            // Insert new record (Values will be null by default)
            const { error: dbError } = await supabase
                .from(tableName)
                .insert([updateData]);
            if (dbError) throw dbError;
            res.json({ success: true, message: 'ส่งรูปเข้าระบบสำเร็จ' });
        }

    } catch (error) {
        console.error("Save Photos Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 2. Admin API: Get Records by Date
// ==========================================
app.get('/api/records', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase URL/Key missing' });
        
        const dateParam = req.query.date; // YYYY-MM-DD
        if (!dateParam) return res.status(400).json({ error: 'Missing date parameter' });

        const startOfDay = new Date(`${dateParam}T00:00:00+07:00`).toISOString();
        const endOfDay = new Date(`${dateParam}T23:59:59.999+07:00`).toISOString();

        const { data: elecData, error: errE } = await supabase
            .from('electric_readings')
            .select('*')
            .gte('created_at', startOfDay)
            .lt('created_at', endOfDay)
            .order('created_at', { ascending: false });

        const { data: waterData, error: errW } = await supabase
            .from('water_readings')
            .select('*')
            .gte('created_at', startOfDay)
            .lt('created_at', endOfDay)
            .order('created_at', { ascending: false });

        res.json({ success: true, electric: elecData || [], water: waterData || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 3. Admin API: Update Values
// ==========================================
app.post('/api/update-values', async (req, res) => {
    try {
        const { id, type, values } = req.body;
        const tableName = type === 'electric' ? 'electric_readings' : 'water_readings';
        
        const { error } = await supabase
            .from(tableName)
            .update(values)
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 4. Settings APIs
// ==========================================
app.get('/api/settings', async (req, res) => {
    try {
        if (!supabase) return res.json({ success: false, error: 'No Supabase' });
        
        const { data: metersData } = await supabase.from('meters').select('*').order('created_at', { ascending: true });
        const { data: recordersData } = await supabase.from('recorders').select('*').order('created_at', { ascending: true });
        
        res.json({ 
            success: true, 
            meters: metersData || [], 
            recorders: (recordersData || []).map(r => r.name) 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/settings/add-meter', async (req, res) => {
    try {
        const { error } = await supabase.from('meters').insert([req.body]);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

app.post('/api/settings/delete-meter', async (req, res) => {
    try {
        const { error } = await supabase.from('meters').delete().eq('id', req.body.id);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

app.post('/api/settings/add-recorder', async (req, res) => {
    try {
        const { error } = await supabase.from('recorders').insert([{ name: req.body.name }]);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

app.post('/api/settings/delete-recorder', async (req, res) => {
    try {
        const { error } = await supabase.from('recorders').delete().eq('name', req.body.name);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

app.post('/api/verify-admin', (req, res) => {
    const adminPass = process.env.ADMIN_PASSWORD || '1234';
    if (req.body.password === adminPass) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// ==========================================
// 5. Data Cleanup APIs
// ==========================================
function extractPathFromUrl(url) {
    if (!url) return null;
    const marker = 'meter_images/';
    const idx = url.indexOf(marker);
    return idx !== -1 ? url.substring(idx + marker.length) : null;
}

async function cleanupOldData(days) {
    if (!supabase) return 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString();

    let totalDeleted = 0;
    const tables = ['electric_readings', 'water_readings'];
    
    for (const table of tables) {
        const { data: oldRecords } = await supabase.from(table).select('*').lt('created_at', cutoffIso);
        if (!oldRecords || oldRecords.length === 0) continue;

        const filesToDelete = [];
        oldRecords.forEach(r => {
            if (table === 'electric_readings') {
                if(r.IMG010) filesToDelete.push(extractPathFromUrl(r.IMG010));
                if(r.IMG011) filesToDelete.push(extractPathFromUrl(r.IMG011));
                if(r.IMG012) filesToDelete.push(extractPathFromUrl(r.IMG012));
            } else {
                if(r.water_img) filesToDelete.push(extractPathFromUrl(r.water_img));
            }
        });

        const validFiles = filesToDelete.filter(Boolean);
        if (validFiles.length > 0) {
            await supabase.storage.from('meter_images').remove(validFiles);
        }

        const ids = oldRecords.map(r => r.id);
        const { error } = await supabase.from(table).delete().in('id', ids);
        if (!error) totalDeleted += oldRecords.length;
    }
    return totalDeleted;
}

app.post('/api/cleanup-manual', async (req, res) => {
    try {
        const deletedCount = await cleanupOldData(60);
        res.json({ success: true, count: deletedCount });
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

// Auto cleanup > 65 days
setInterval(() => {
    cleanupOldData(65).catch(console.error);
}, 1000 * 60 * 60 * 24);

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
