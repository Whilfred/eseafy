const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const auth    = require('../middleware/auth');

const router = express.Router();

// ══════════════════════════════════════
//  CONFIG MULTER
// ══════════════════════════════════════
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Dossier uploads créé :', uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext      = path.extname(file.originalname).toLowerCase();
    const basename = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 30);
    const filename = `${Date.now()}-${basename}${ext}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  console.log('📸 Fichier reçu :', file.originalname, '| Type :', file.mimetype);
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.log('❌ Format refusé :', file.mimetype);
    cb(new Error('Format non supporté. Utilisez JPG, PNG, WEBP ou GIF.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ══════════════════════════════════════
//  POST /api/upload/image
// ══════════════════════════════════════
router.post('/image', auth, upload.single('image'), (req, res) => {
  console.log('📸 POST /api/upload/image appelé');
  console.log('📸 req.file :', req.file);

  if (!req.file) {
    console.log('❌ Aucun fichier reçu');
    return res.status(400).json({ message: 'Aucun fichier reçu.' });
  }

  const url = `/uploads/${req.file.filename}`;
  console.log('✅ Image sauvegardée :', url);

  return res.status(201).json({
    message: 'Image uploadée avec succès.',
    url,
    filename: req.file.filename,
    size:     req.file.size,
  });
});

// ══════════════════════════════════════
//  POST /api/upload/images
// ══════════════════════════════════════
router.post('/images', auth, upload.array('images', 8), (req, res) => {
  console.log('📸 POST /api/upload/images appelé');
  console.log('📸 Nombre de fichiers reçus :', req.files ? req.files.length : 0);
  console.log('📸 req.files :', req.files);

  if (!req.files || req.files.length === 0) {
    console.log('❌ Aucun fichier reçu dans req.files');
    return res.status(400).json({ message: 'Aucun fichier reçu.' });
  }

  const urls = req.files.map(f => `/uploads/${f.filename}`);
  console.log('✅ URLs générées :', urls);

  return res.status(201).json({
    message: `${req.files.length} image(s) uploadée(s).`,
    urls,
  });
});

// ══════════════════════════════════════
//  DELETE /api/upload/image/:filename
// ══════════════════════════════════════
router.delete('/image/:filename', auth, (req, res) => {
  const filepath = path.join(uploadsDir, req.params.filename);
  console.log('🗑️ Suppression :', filepath);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ message: 'Fichier introuvable.' });
  }

  fs.unlinkSync(filepath);
  console.log('✅ Image supprimée :', req.params.filename);
  return res.json({ message: 'Image supprimée.' });
});

module.exports = router;