/**
 * KinéPulse / KinéSportif — Pipeline Approval Multi-Comptes
 * Un seul email par compte (groupe Facebook + Instagram + TikTok pour la
 * vidéo ; Facebook + Instagram pour le carrousel).
 * L'approbation (clic ou auto après 6h) marque le lot "approuvé" mais NE
 * publie PAS immédiatement — la vraie publication n'a lieu qu'à l'heure de
 * pointe propre à chaque compte (voir checkPeakTimePublish), pour que le
 * contenu sorte toujours au bon moment pour son audience, peu importe
 * quand tu cliques.
 *
 * NOUVEAU (carrousel) : ce script gère maintenant deux types de contenu,
 * distingués par la colonne "media_type" de la feuille "Queue" :
 *   - "video"    (comportement original, inchangé) -> video_url
 *   - "carousel" (nouveau) -> media_urls (JSON d'URLs d'images), publié sur
 *     Facebook + Instagram uniquement (pas de TikTok pour l'instant)
 * Les lignes créées par l'ancien flux vidéo n'ont pas de media_type — le
 * code les traite comme "video" par défaut (rétrocompatible).
 *
 * MIGRATION D'UNE FEUILLE EXISTANTE : si la feuille "Queue" existe déjà
 * (cas normal si tu avais déjà le flux vidéo), ajoute manuellement deux
 * colonnes d'en-tête sur la ligne 1 : "media_type" et "media_urls"
 * (n'importe où, l'ordre n'a pas d'importance — le code cherche les
 * colonnes par leur nom). Ou lance fixHeaderRow() une fois.
 */

const SHEET_ID = '1OvQMAWNT6nqq9XCAELuiGrWQRn-1yvSGH4Gioe9RACs';
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyhY-saw9KSX2yqLcuVH3ll7vceljLgrwNDCSpOUF4YUuyGWTsiRyi29-LbaZp7JfqCbg/exec';
const APPROVAL_DELAY_HOURS = 6;

const props = PropertiesService.getScriptProperties();
const APPROVAL_EMAIL = props.getProperty('APPROVAL_EMAIL');
const PIPELINE_SECRET = props.getProperty('PIPELINE_SECRET');

// ============ QUEUE : un lot = un compte, plusieurs plateformes ============
function queueBatchForApproval(account, platforms, mediaType, mediaUrl, caption, hashtags) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue')
    || SpreadsheetApp.openById(SHEET_ID).insertSheet('Queue');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id', 'batch_id', 'account', 'platform', 'media_type', 'video_url', 'media_urls', 'caption', 'hashtags', 'status', 'created_at', 'token']);
  }

  const batchId = Utilities.getUuid();
  const token = Utilities.getUuid();
  const createdAt = new Date();

  const videoUrlCell = mediaType === 'carousel' ? '' : mediaUrl;
  const mediaUrlsCell = mediaType === 'carousel' ? mediaUrl : '';

  platforms.forEach(function(platform) {
    const id = Utilities.getUuid();
    sheet.appendRow([id, batchId, account, platform, mediaType, videoUrlCell, mediaUrlsCell, caption, hashtags, 'pending', createdAt, token]);
  });

  sendBatchApprovalEmail(batchId, account, platforms, mediaType, mediaUrl, caption, hashtags, token);
  return batchId;
}

function sendBatchApprovalEmail(batchId, account, platforms, mediaType, mediaUrl, caption, hashtags, token) {
  const approveUrl = `${WEBAPP_URL}?action=approve&batch=${batchId}&token=${token}`;
  const rejectUrl = `${WEBAPP_URL}?action=reject&batch=${batchId}&token=${token}`;
  const accountLabel = account === 'kinesportif' ? 'KinéSportif' : 'KinéPulse';
  const platformsLabel = platforms.map(function(p) {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' + ');
  const peakLabel = account === 'kinesportif'
    ? 'tous les jours à 19h (heure du Liban)'
    : 'dimanche-vendredi à 19h, samedi à 10h (heure de Montréal)';
  const mediaLabel = mediaType === 'carousel' ? 'Carrousel' : 'Vidéo';

  const subject = `[${accountLabel}] Approbation requise — ${mediaLabel} — ${platformsLabel}`;

  // NOUVEAU : aperçu adapté au type de média — miniatures pour un carrousel,
  // lien unique pour une vidéo (comportement original inchangé).
  let mediaPreviewHtml;
  if (mediaType === 'carousel') {
    let imageUrls = [];
    try { imageUrls = JSON.parse(mediaUrl || '[]'); } catch (e) { imageUrls = []; }
    const thumbs = imageUrls.map(function(url) {
      return `<img src="${url}" style="width:120px;height:150px;object-fit:cover;border-radius:8px;margin:4px;border:1px solid #ddd;">`;
    }).join('');
    mediaPreviewHtml = `<p><strong>${imageUrls.length} slides :</strong></p><div style="display:flex;flex-wrap:wrap;">${thumbs}</div>`;
  } else {
    mediaPreviewHtml = `<p><a href="${mediaUrl}">Voir la vidéo</a></p>`;
  }

  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 500px;">
      <h2>${accountLabel} — Nouveau post en attente (${mediaLabel})</h2>
      <p><strong>Plateformes :</strong> ${platformsLabel}</p>
      <p><strong>Caption :</strong><br>${caption}</p>
      <p><strong>Hashtags :</strong><br>${hashtags}</p>
      ${mediaPreviewHtml}
      <p style="margin: 24px 0;">
        <a href="${approveUrl}" style="background:#0a7c3a;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;margin-right:12px;">✅ Approuver tout</a>
        <a href="${rejectUrl}" style="background:#c0392b;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">❌ Rejeter tout</a>
      </p>
      <p style="color:#888;font-size:12px;">
        Approuver ne publie pas tout de suite — la publication a lieu au prochain créneau de pointe : ${peakLabel}.
        Si tu ne réponds pas dans ${APPROVAL_DELAY_HOURS}h, le lot est approuvé automatiquement (mais attend quand même le bon créneau).
        ${platforms.indexOf('tiktok') !== -1 ? '<br><em>(TikTok suit un rythme de vérification séparé, géré par le serveur.)</em>' : ''}
      </p>
    </div>
  `;

  GmailApp.sendEmail(APPROVAL_EMAIL, subject, '', { htmlBody: body });
}

function doGet(e) {
  const action = e.parameter.action;

  if (action === 'pendingTiktok') {
    if (e.parameter.secret !== PIPELINE_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify(getPendingTikTokRows()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'markDone') {
    if (e.parameter.secret !== PIPELINE_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    markRowPublished(e.parameter.id);
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ---- Clic Approuver/Rejeter : marque le lot, NE publie PAS ici ----
  const batchId = e.parameter.batch;
  const token = e.parameter.token;

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const batchCol = headers.indexOf('batch_id');
  const tokenCol = headers.indexOf('token');
  const statusCol = headers.indexOf('status');

  let matchedRows = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][batchCol] === batchId && data[i][tokenCol] === token) {
      matchedRows.push(i);
    }
  }

  if (matchedRows.length === 0) {
    return HtmlService.createHtmlOutput('Lien invalide ou expiré.');
  }
  if (data[matchedRows[0]][statusCol] !== 'pending') {
    return HtmlService.createHtmlOutput('Ce lot a déjà été traité.');
  }

  if (action === 'approve') {
    matchedRows.forEach(function(i) {
      sheet.getRange(i + 1, statusCol + 1).setValue('approved');
    });
    return HtmlService.createHtmlOutput('<h2>✅ Approuvé — sera publié au prochain créneau de pointe.</h2>');
  } else if (action === 'reject') {
    matchedRows.forEach(function(i) {
      sheet.getRange(i + 1, statusCol + 1).setValue('rejected');
    });
    return HtmlService.createHtmlOutput('<h2>❌ Lot rejeté, rien ne sera publié.</h2>');
  }

  return HtmlService.createHtmlOutput('Action inconnue.');
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // NOUVEAU : media_type distingue vidéo (comportement original) et
    // carrousel. Absent -> "video", pour rester compatible avec l'appelant
    // vidéo existant qui n'envoie pas ce champ.
    const mediaType = data.media_type || 'video';
    const mediaUrl = mediaType === 'carousel'
      ? JSON.stringify(data.media_urls || [])
      : (data.video_url || '');

    const batchId = queueBatchForApproval(data.account, data.platforms, mediaType, mediaUrl, data.caption, data.hashtags);
    return ContentService.createTextOutput(JSON.stringify({ success: true, batch_id: batchId }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============ AUTO-APPROBATION après 6h (ne publie toujours pas) ============
function checkPendingApprovals() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const statusCol = headers.indexOf('status');
  const createdCol = headers.indexOf('created_at');
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    if (data[i][statusCol] === 'pending') {
      const created = new Date(data[i][createdCol]);
      const hoursElapsed = (now - created) / (1000 * 60 * 60);
      if (hoursElapsed >= APPROVAL_DELAY_HOURS) {
        sheet.getRange(i + 1, statusCol + 1).setValue('approved');
      }
    }
  }
}

// ============ PUBLICATION AU CRÉNEAU DE POINTE (déclencheur horaire) ============
// KinéPulse : dim-ven 19h, sam 10h (heure de Montréal)
// KinéSportif : tous les jours 19h (heure du Liban)
function checkPeakTimePublish() {
  publishIfPeakTime('kinepulse', 'America/Toronto', function(dow, hour) {
    const isSaturday = dow === 6;
    return isSaturday ? hour === 10 : hour === 19;
  });
  publishIfPeakTime('kinesportif', 'Asia/Beirut', function(dow, hour) {
    return hour === 19;
  });
}

function publishIfPeakTime(account, timezone, isPeakFn) {
  const now = new Date();
  const dow = parseInt(Utilities.formatDate(now, timezone, 'u')); // 1=lundi...7=dimanche
  const dowSunday0 = dow === 7 ? 0 : dow; // convertit pour matcher "Saturday"=6 style JS (dim=0)
  const hour = parseInt(Utilities.formatDate(now, timezone, 'H'));

  if (!isPeakFn(dowSunday0, hour)) return;

  publishApprovedRows(account);
}

// Publie toutes les lignes "approved" d'un compte (Facebook, Instagram —
// vidéo ET carrousel) et passe TikTok en "approved-tiktok-pending" pour que
// le serveur s'en occupe (TikTok reste vidéo-only pour l'instant).
function publishApprovedRows(account) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const accountCol = headers.indexOf('account');
  const platformCol = headers.indexOf('platform');
  const statusCol = headers.indexOf('status');

  for (let i = 1; i < data.length; i++) {
    if (data[i][accountCol] !== account) continue;
    if (data[i][statusCol] !== 'approved') continue;

    const platform = data[i][platformCol];
    if (platform === 'tiktok') {
      sheet.getRange(i + 1, statusCol + 1).setValue('approved-tiktok-pending');
      continue;
    }
    try {
      publishPost(data[i], headers);
      sheet.getRange(i + 1, statusCol + 1).setValue('published');
    } catch (err) {
      sendErrorEmail(`Échec publication (créneau de pointe) — ${account}/${platform}`, err.message, 'critique');
    }
  }
}

function publishPost(row, headers) {
  const account = row[headers.indexOf('account')];
  const platform = row[headers.indexOf('platform')];
  const mediaType = row[headers.indexOf('media_type')] || 'video'; // rétrocompatible : lignes vidéo créées avant cette colonne
  const caption = row[headers.indexOf('caption')];
  const hashtags = row[headers.indexOf('hashtags')];
  const fullCaption = `${caption}\n\n${hashtags}`;

  if (mediaType === 'carousel') {
    let imageUrls = [];
    try { imageUrls = JSON.parse(row[headers.indexOf('media_urls')] || '[]'); } catch (e) { imageUrls = []; }

    if (platform === 'instagram') {
      publishCarouselToInstagram(imageUrls, fullCaption, account);
    } else if (platform === 'facebook') {
      publishCarouselToFacebook(imageUrls, fullCaption, account);
    }
    return;
  }

  const videoUrl = row[headers.indexOf('video_url')];
  if (platform === 'instagram') {
    publishToInstagram(videoUrl, fullCaption, account);
  } else if (platform === 'facebook') {
    publishToFacebook(videoUrl, fullCaption, account);
  }
}

function publishToInstagram(videoUrl, caption, account) {
  const suffix = account === 'kinesportif' ? '_KINESPORTIF' : '';
  const igId = props.getProperty(`IG_BUSINESS_ACCOUNT_ID${suffix}`);
  const token = props.getProperty(`IG_ACCESS_TOKEN${suffix}`);

  // Étape 1 : créer le conteneur vidéo
  const createRes = UrlFetchApp.fetch(
    `https://graph.instagram.com/v21.0/${igId}/media`,
    {
      method: 'post',
      muteHttpExceptions: true,
      payload: { video_url: videoUrl, caption: caption, media_type: 'REELS', access_token: token }
    }
  );
  if (createRes.getResponseCode() >= 400) {
    throw new Error(`Instagram create failed: ${createRes.getContentText()}`);
  }
  const creationId = JSON.parse(createRes.getContentText()).id;

  // Étape 2 : attendre qu'Instagram ait fini de traiter la vidéo
  let ready = false;
  for (let i = 0; i < 20; i++) {
    Utilities.sleep(6000);
    const statusRes = UrlFetchApp.fetch(
      `https://graph.instagram.com/v21.0/${creationId}?fields=status_code&access_token=${token}`,
      { muteHttpExceptions: true }
    );
    const statusCode = JSON.parse(statusRes.getContentText()).status_code;
    if (statusCode === 'FINISHED') { ready = true; break; }
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Instagram processing ${statusCode}: ${statusRes.getContentText()}`);
    }
  }
  if (!ready) throw new Error('Instagram processing timeout (>2 min)');

  // Étape 3 : publier
  const pubRes = UrlFetchApp.fetch(
    `https://graph.instagram.com/v21.0/${igId}/media_publish`,
    {
      method: 'post',
      muteHttpExceptions: true,
      payload: { creation_id: creationId, access_token: token }
    }
  );
  if (pubRes.getResponseCode() >= 400) {
    throw new Error(`Instagram publish failed: ${pubRes.getContentText()}`);
  }
}

// NOUVEAU — carrousel Instagram : un conteneur enfant par image
// (is_carousel_item), puis un conteneur parent media_type=CAROUSEL qui les
// référence, puis publication. Entièrement synchrone, pas de session
// d'upload comme pour la vidéo (Instagram télécharge chaque image depuis
// son URL publique).
function publishCarouselToInstagram(imageUrls, caption, account) {
  const suffix = account === 'kinesportif' ? '_KINESPORTIF' : '';
  const igId = props.getProperty(`IG_BUSINESS_ACCOUNT_ID${suffix}`);
  const token = props.getProperty(`IG_ACCESS_TOKEN${suffix}`);

  if (!imageUrls || imageUrls.length < 2) {
    throw new Error(`Carrousel Instagram : il faut au moins 2 images (reçu : ${imageUrls ? imageUrls.length : 0})`);
  }
  if (imageUrls.length > 10) {
    throw new Error(`Carrousel Instagram : maximum 10 images (reçu : ${imageUrls.length})`);
  }

  // Étape 1 : un conteneur enfant par image
  const childIds = imageUrls.map(function(imageUrl) {
    const res = UrlFetchApp.fetch(
      `https://graph.instagram.com/v21.0/${igId}/media`,
      {
        method: 'post',
        muteHttpExceptions: true,
        payload: { image_url: imageUrl, is_carousel_item: 'true', access_token: token }
      }
    );
    if (res.getResponseCode() >= 400) {
      throw new Error(`Instagram carousel child create failed: ${res.getContentText()}`);
    }
    return JSON.parse(res.getContentText()).id;
  });

  // Étape 2 : conteneur parent (CAROUSEL) référençant les enfants
  const createRes = UrlFetchApp.fetch(
    `https://graph.instagram.com/v21.0/${igId}/media`,
    {
      method: 'post',
      muteHttpExceptions: true,
      payload: {
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption: caption,
        access_token: token
      }
    }
  );
  if (createRes.getResponseCode() >= 400) {
    throw new Error(`Instagram carousel parent create failed: ${createRes.getContentText()}`);
  }
  const creationId = JSON.parse(createRes.getContentText()).id;

  // Étape 3 : attendre que le conteneur soit prêt (rapide pour des images —
  // 30s de marge, largement suffisant, contre 2 min pour une vidéo)
  let ready = false;
  for (let i = 0; i < 10; i++) {
    Utilities.sleep(3000);
    const statusRes = UrlFetchApp.fetch(
      `https://graph.instagram.com/v21.0/${creationId}?fields=status_code&access_token=${token}`,
      { muteHttpExceptions: true }
    );
    const statusCode = JSON.parse(statusRes.getContentText()).status_code;
    if (statusCode === 'FINISHED') { ready = true; break; }
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Instagram carousel processing ${statusCode}: ${statusRes.getContentText()}`);
    }
  }
  if (!ready) throw new Error('Instagram carousel processing timeout (>30s)');

  // Étape 4 : publier
  const pubRes = UrlFetchApp.fetch(
    `https://graph.instagram.com/v21.0/${igId}/media_publish`,
    {
      method: 'post',
      muteHttpExceptions: true,
      payload: { creation_id: creationId, access_token: token }
    }
  );
  if (pubRes.getResponseCode() >= 400) {
    throw new Error(`Instagram carousel publish failed: ${pubRes.getContentText()}`);
  }
}

function publishToFacebook(videoUrl, caption, account) {
  const suffix = account === 'kinesportif' ? '_KINESPORTIF' : '';
  const pageId = props.getProperty(`FB_PAGE_ID${suffix}`);
  const token = props.getProperty(`FB_PAGE_TOKEN${suffix}`);

  // Étape 1 : télécharger la vidéo depuis ton serveur
  const videoRes = UrlFetchApp.fetch(videoUrl, { muteHttpExceptions: true });
  if (videoRes.getResponseCode() !== 200) {
    throw new Error(`Téléchargement vidéo échoué (${videoRes.getResponseCode()}) : ${videoUrl}`);
  }
  const videoBlob = videoRes.getBlob();
  const fileSize = videoBlob.getBytes().length;

  // Étape 2 : démarrer une session d'upload Reels
  const startRes = UrlFetchApp.fetch(
    `https://graph.facebook.com/v21.0/${pageId}/video_reels`,
    { method: 'post', muteHttpExceptions: true, payload: { upload_phase: 'start', access_token: token } }
  );
  if (startRes.getResponseCode() >= 400) {
    throw new Error(`Facebook start failed: ${startRes.getContentText()}`);
  }
  const startData = JSON.parse(startRes.getContentText());
  const videoId = startData.video_id;
  const uploadUrl = startData.upload_url;

  // Étape 3 : envoyer le fichier directement à Facebook
  const upRes = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/octet-stream',
    headers: {
      'Authorization': `OAuth ${token}`,
      'offset': '0',
      'file_size': String(fileSize)
    },
    payload: videoBlob.getBytes()
  });
  if (upRes.getResponseCode() >= 400) {
    throw new Error(`Facebook upload failed: ${upRes.getContentText()}`);
  }

  // Étape 4 : attendre que Facebook ait fini de traiter la vidéo
  let ready = false;
  for (let i = 0; i < 20; i++) {
    Utilities.sleep(6000);
    const statusRes = UrlFetchApp.fetch(
      `https://graph.facebook.com/v21.0/${videoId}?fields=status&access_token=${token}`,
      { muteHttpExceptions: true }
    );
    const statusData = JSON.parse(statusRes.getContentText());
    const st = statusData.status || {};
    const phase = st.processing_phase;
    const uploading = st.uploading_phase;
    if (uploading && uploading.status === 'error') {
      throw new Error(`Facebook upload error: ${JSON.stringify(uploading.errors || uploading)}`);
    }
    if (phase && phase.status === 'error') {
      throw new Error(`Facebook processing error: ${JSON.stringify(phase.error)}`);
    }
    if (uploading && uploading.status === 'complete' && (!phase || phase.status === 'complete' || phase.status === 'not_started')) {
      ready = true;
      break;
    }
  }
  if (!ready) throw new Error('Facebook Reels processing timeout (>2 min)');

  // Étape 5 : publier le Reel
  const finishRes = UrlFetchApp.fetch(
    `https://graph.facebook.com/v21.0/${pageId}/video_reels`,
    {
      method: 'post',
      muteHttpExceptions: true,
      payload: {
        video_id: videoId, upload_phase: 'finish', video_state: 'PUBLISHED',
        description: caption, access_token: token
      }
    }
  );
  if (finishRes.getResponseCode() >= 400) {
    throw new Error(`Facebook finish failed: ${finishRes.getContentText()}`);
  }
}

// NOUVEAU — carrousel Facebook : chaque image est d'abord uploadée sans être
// publiée (/photos, published=false) pour obtenir un photo_id, puis un seul
// post /feed référence toutes les photos via attached_media. Beaucoup plus
// simple que le flux Reels (pas de session d'upload, pas de polling long).
function publishCarouselToFacebook(imageUrls, caption, account) {
  const suffix = account === 'kinesportif' ? '_KINESPORTIF' : '';
  const pageId = props.getProperty(`FB_PAGE_ID${suffix}`);
  const token = props.getProperty(`FB_PAGE_TOKEN${suffix}`);

  if (!imageUrls || imageUrls.length < 2) {
    throw new Error(`Carrousel Facebook : il faut au moins 2 images (reçu : ${imageUrls ? imageUrls.length : 0})`);
  }

  // Étape 1 : uploader chaque image sans la publier (published: false)
  const photoIds = imageUrls.map(function(imageUrl) {
    const res = UrlFetchApp.fetch(
      `https://graph.facebook.com/v21.0/${pageId}/photos`,
      {
        method: 'post',
        muteHttpExceptions: true,
        payload: { url: imageUrl, published: 'false', access_token: token }
      }
    );
    if (res.getResponseCode() >= 400) {
      throw new Error(`Facebook carousel photo upload failed: ${res.getContentText()}`);
    }
    return JSON.parse(res.getContentText()).id;
  });

  // Étape 2 : créer le post référençant toutes les photos
  const attachedMedia = photoIds.map(function(id) { return { media_fbid: id }; });
  const feedRes = UrlFetchApp.fetch(
    `https://graph.facebook.com/v21.0/${pageId}/feed`,
    {
      method: 'post',
      muteHttpExceptions: true,
      payload: {
        message: caption,
        attached_media: JSON.stringify(attachedMedia),
        access_token: token
      }
    }
  );
  if (feedRes.getResponseCode() >= 400) {
    throw new Error(`Facebook carousel post failed: ${feedRes.getContentText()}`);
  }
}

function getPendingTikTokRows() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  const accountCol = headers.indexOf('account');
  const platformCol = headers.indexOf('platform');
  const videoUrlCol = headers.indexOf('video_url');
  const captionCol = headers.indexOf('caption');
  const hashtagsCol = headers.indexOf('hashtags');
  const statusCol = headers.indexOf('status');

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][platformCol] === 'tiktok' && data[i][statusCol] === 'approved-tiktok-pending') {
      rows.push({
        id: data[i][idCol],
        account: data[i][accountCol],
        video_url: data[i][videoUrlCol],
        caption: data[i][captionCol],
        hashtags: data[i][hashtagsCol],
      });
    }
  }
  return rows;
}

function markRowPublished(id) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === id) {
      sheet.getRange(i + 1, statusCol + 1).setValue('published');
      return;
    }
  }
}

function sendErrorEmail(subject, details, severity) {
  const icon = severity === 'critique' ? '🔴' : '🟡';
  const fullSubject = `[Pipeline] ${icon} ${subject}`;
  const body = `
    <div style="font-family: Arial, sans-serif;">
      <h3>${icon} ${severity === 'critique' ? 'Erreur critique' : 'Avertissement'}</h3>
      <p><strong>${subject}</strong></p>
      <pre style="background:#f4f4f4;padding:12px;border-radius:6px;white-space:pre-wrap;">${details}</pre>
      <p style="color:#888;font-size:12px;">${new Date().toLocaleString('fr-CA')}</p>
    </div>
  `;
  GmailApp.sendEmail(APPROVAL_EMAIL, fullSubject, '', { htmlBody: body });
}

function testEmailKinePulse() {
  queueBatchForApproval('kinepulse', ['facebook', 'instagram', 'tiktok'], 'video',
    'https://example.com/test-video.mp4',
    'Ceci est un test du système d\'approbation groupé 🎉', '#test #kinepulse');
}

function testEmailKineSportif() {
  queueBatchForApproval('kinesportif', ['facebook', 'instagram', 'tiktok'], 'video',
    'https://example.com/test-video.mp4',
    'This is a test of the grouped approval system 🎉', '#test #kinesportif');
}

// NOUVEAU — test du flux carrousel (images de test picsum.photos, publiques)
function testEmailCarouselKinePulse() {
  queueBatchForApproval('kinepulse', ['facebook', 'instagram'], 'carousel',
    JSON.stringify([
      'https://picsum.photos/seed/kp1/1080/1350',
      'https://picsum.photos/seed/kp2/1080/1350',
      'https://picsum.photos/seed/kp3/1080/1350'
    ]),
    'Ceci est un test du carrousel 🎉', '#test #kinepulse');
}

function weeklySheetBackup() {
  const original = DriveApp.getFileById(SHEET_ID);
  const dateStr = Utilities.formatDate(new Date(), 'GMT-4', 'yyyy-MM-dd');
  const backupName = `Pipeline — Backup ${dateStr}`;

  const folders = DriveApp.getFoldersByName('KinéPulse Backups');
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('KinéPulse Backups');

  original.makeCopy(backupName, folder);

  const files = folder.getFiles();
  const allBackups = [];
  while (files.hasNext()) {
    allBackups.push(files.next());
  }
  allBackups.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  for (let i = 8; i < allBackups.length; i++) {
    allBackups[i].setTrashed(true);
  }
}

function cleanupOldPendingTests() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const statusCol = headers.indexOf('status');
  const targetStatuses = ['pending', 'approved', 'approved-tiktok-pending', 'approved (auto)'];

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (targetStatuses.indexOf(data[i][statusCol]) !== -1) {
      sheet.getRange(i + 1, statusCol + 1).setValue('rejected');
      count++;
    }
  }
  Logger.log(`${count} lignes nettoyées.`);
}

function approveManually() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const batchCol = headers.indexOf('batch_id');
  const statusCol = headers.indexOf('status');

  const batchesToApprove = ['8b999ea1-22d2-440c-b41b-3f8dfc3f831f', 'b4c2c5f1-7fbc-4941-8f48-ed1336eb0e6d'];
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (batchesToApprove.indexOf(data[i][batchCol]) !== -1) {
      sheet.getRange(i + 1, statusCol + 1).setValue('approved');
      count++;
    }
  }
  Logger.log(`${count} lignes approuvées manuellement.`);
}

function fixHeaderRow() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  sheet.getRange(1, 1, 1, 12).setValues([
    ['id', 'batch_id', 'account', 'platform', 'media_type', 'video_url', 'media_urls', 'caption', 'hashtags', 'status', 'created_at', 'token']
  ]);
  Logger.log('En-tête corrigé (avec colonnes media_type / media_urls).');
}

// Republication manuelle des lignes "approved" de KinéSportif (hors créneau de pointe)
function publishKinesportifNow() {
  publishApprovedRows('kinesportif');
  Logger.log('Republication KinéSportif terminée.');
}

// Rejette uniquement les lignes de test / placeholders (jamais les vraies vidéos/carrousels)
function rejectTestRows() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const urlCol = headers.indexOf('video_url');
  const mediaUrlsCol = headers.indexOf('media_urls');
  const mediaTypeCol = headers.indexOf('media_type');
  const statusCol = headers.indexOf('status');
  const targets = ['pending', 'approved', 'approved-tiktok-pending'];

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const mediaType = mediaTypeCol !== -1 ? (data[i][mediaTypeCol] || 'video') : 'video';
    const status = data[i][statusCol];
    let isTest;
    if (mediaType === 'carousel') {
      const mediaUrls = String(data[i][mediaUrlsCol] || '');
      isTest = mediaUrls.indexOf('picsum.photos') !== -1;
    } else {
      const url = String(data[i][urlCol] || '');
      isTest = url.indexOf('example.com') !== -1 || url.indexOf('URL_VIDEO_') === 0 || url === '';
    }
    if (isTest && targets.indexOf(status) !== -1) {
      sheet.getRange(i + 1, statusCol + 1).setValue('rejected');
      count++;
    }
  }
  Logger.log(count + ' lignes de test rejetées.');
}
