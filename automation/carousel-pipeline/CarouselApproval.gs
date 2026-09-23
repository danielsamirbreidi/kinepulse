/**
 * KinéPulse / KinéSportif — Carrousel : Approbation + Publication
 * ==================================================================
 * Projet Apps Script INDÉPENDANT du pipeline vidéo — sa propre feuille
 * Google Sheet, son propre lien de déploiement, son propre email
 * d'approbation. Rien n'est partagé avec le système vidéo : aucun risque
 * de casser ou de mélanger les deux.
 *
 * Un seul email par compte (Facebook + Instagram groupés). L'approbation
 * (clic ou auto après 6h) marque le lot "approuvé" mais NE publie PAS
 * immédiatement — la vraie publication n'a lieu qu'à l'heure de pointe
 * propre à chaque compte (voir checkPeakTimePublish), pour que le contenu
 * sorte toujours au bon moment pour son audience, peu importe quand tu
 * cliques.
 *
 * À FAIRE UNE SEULE FOIS avant d'utiliser ce script — voir README.md :
 *   1. Crée une NOUVELLE Google Sheet (vide), copie son ID ci-dessous
 *      dans SHEET_ID
 *   2. Crée un NOUVEAU projet Apps Script, colle ce fichier dedans
 *   3. Propriétés du script (Paramètres du projet > Propriétés du script) :
 *        APPROVAL_EMAIL, IG_BUSINESS_ACCOUNT_ID(_KINESPORTIF),
 *        IG_ACCESS_TOKEN(_KINESPORTIF), FB_PAGE_ID(_KINESPORTIF),
 *        FB_PAGE_TOKEN(_KINESPORTIF), FB_APP_SECRET, FB_USER_TOKEN
 *        (ces deux dernières sont nécessaires pour le renouvellement
 *        automatique des tokens — copie les mêmes valeurs que le projet
 *        vidéo)
 *   4. Déploie comme application Web, copie l'URL dans WEBAPP_URL,
 *      redéploie une deuxième fois avec cette URL collée dans le code
 *   5. Exécute setupTriggers() une fois (menu déroulant > setupTriggers > ▶)
 */

// TODO : remplace par l'ID de TA nouvelle Google Sheet (dédiée au carrousel,
// différente de celle des vidéos) — visible dans son URL :
// https://docs.google.com/spreadsheets/d/CET_ID_ICI/edit
const SHEET_ID = '1MSxA4W8574RqOZd6LIpeNmNJ-CaHVd9pGfGGqBnlIrA';

// TODO : remplace par l'URL /exec de CE déploiement (Apps Script >
// Déployer > Gérer les déploiements) — pas celle du pipeline vidéo.
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwQm3NvXVDwEESWSOqd1RXh8XTB5t1MDGp2jrGW56I-OUdqa8Lti2ij6emFxsjZha24/exec';

const APPROVAL_DELAY_HOURS = 6;

const props = PropertiesService.getScriptProperties();
const APPROVAL_EMAIL = props.getProperty('APPROVAL_EMAIL');

// ============ QUEUE : un lot = un compte, Facebook + Instagram ============
function queueBatchForApproval(account, platforms, mediaUrls, caption, hashtags) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue')
    || SpreadsheetApp.openById(SHEET_ID).insertSheet('Queue');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id', 'batch_id', 'account', 'platform', 'media_urls', 'caption', 'hashtags', 'status', 'created_at', 'token']);
  }

  const batchId = Utilities.getUuid();
  const token = Utilities.getUuid();
  const createdAt = new Date();
  const mediaUrlsJson = JSON.stringify(mediaUrls);

  platforms.forEach(function(platform) {
    const id = Utilities.getUuid();
    sheet.appendRow([id, batchId, account, platform, mediaUrlsJson, caption, hashtags, 'pending', createdAt, token]);
  });

  sendBatchApprovalEmail(batchId, account, platforms, mediaUrls, caption, hashtags, token);
  return batchId;
}

function sendBatchApprovalEmail(batchId, account, platforms, mediaUrls, caption, hashtags, token) {
  const approveUrl = `${WEBAPP_URL}?action=approve&batch=${batchId}&token=${token}`;
  const rejectUrl = `${WEBAPP_URL}?action=reject&batch=${batchId}&token=${token}`;
  const accountLabel = account === 'kinesportif' ? 'KinéSportif' : 'KinéPulse';
  const platformsLabel = platforms.map(function(p) {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' + ');
  const peakLabel = account === 'kinesportif'
    ? 'tous les jours à 19h (heure du Liban)'
    : 'dimanche-vendredi à 19h, samedi à 10h (heure de Montréal)';

  const subject = `[${accountLabel}] Carrousel à approuver — ${platformsLabel}`;

  const thumbs = mediaUrls.map(function(url) {
    return `<img src="${url}" style="width:120px;height:150px;object-fit:cover;border-radius:8px;margin:4px;border:1px solid #ddd;">`;
  }).join('');

  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 500px;">
      <h2>${accountLabel} — Nouveau carrousel en attente</h2>
      <p><strong>Plateformes :</strong> ${platformsLabel}</p>
      <p><strong>Caption :</strong><br>${caption}</p>
      <p><strong>Hashtags :</strong><br>${hashtags}</p>
      <p><strong>${mediaUrls.length} slides :</strong></p>
      <div style="display:flex;flex-wrap:wrap;">${thumbs}</div>
      <p style="margin: 24px 0;">
        <a href="${approveUrl}" style="background:#0a7c3a;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;margin-right:12px;">✅ Approuver tout</a>
        <a href="${rejectUrl}" style="background:#c0392b;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">❌ Rejeter tout</a>
      </p>
      <p style="color:#888;font-size:12px;">
        Approuver ne publie pas tout de suite — la publication a lieu au prochain créneau de pointe : ${peakLabel}.
        Si tu ne réponds pas dans ${APPROVAL_DELAY_HOURS}h, le lot est approuvé automatiquement (mais attend quand même le bon créneau).
      </p>
    </div>
  `;

  GmailApp.sendEmail(APPROVAL_EMAIL, subject, '', { htmlBody: body });
}

function doGet(e) {
  const action = e.parameter.action;
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
    return HtmlService.createHtmlOutput('<h2>✅ Carrousel approuvé — sera publié au prochain créneau de pointe.</h2>');
  } else if (action === 'reject') {
    matchedRows.forEach(function(i) {
      sheet.getRange(i + 1, statusCol + 1).setValue('rejected');
    });
    return HtmlService.createHtmlOutput('<h2>❌ Carrousel rejeté, rien ne sera publié.</h2>');
  }

  return HtmlService.createHtmlOutput('Action inconnue.');
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const batchId = queueBatchForApproval(data.account, data.platforms, data.media_urls, data.caption, data.hashtags);
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
// (mêmes créneaux que le pipeline vidéo, pour rester cohérent pour ton
// audience — mais ce sont deux systèmes séparés, aucun code partagé)
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
    try {
      publishPost(data[i], headers);
      sheet.getRange(i + 1, statusCol + 1).setValue('published');
    } catch (err) {
      sendErrorEmail(`Échec publication carrousel (créneau de pointe) — ${account}/${platform}`, err.message, 'critique');
    }
  }
}

function publishPost(row, headers) {
  const account = row[headers.indexOf('account')];
  const platform = row[headers.indexOf('platform')];
  const caption = row[headers.indexOf('caption')];
  const hashtags = row[headers.indexOf('hashtags')];
  const fullCaption = `${caption}\n\n${hashtags}`;
  let imageUrls = [];
  try { imageUrls = JSON.parse(row[headers.indexOf('media_urls')] || '[]'); } catch (e) { imageUrls = []; }

  if (platform === 'instagram') {
    publishCarouselToInstagram(imageUrls, fullCaption, account);
  } else if (platform === 'facebook') {
    publishCarouselToFacebook(imageUrls, fullCaption, account);
  }
}

// Carrousel Instagram : un conteneur enfant par image (is_carousel_item),
// puis un conteneur parent media_type=CAROUSEL qui les référence, puis
// publication. Entièrement synchrone, pas de session d'upload comme pour
// une vidéo (Instagram télécharge chaque image depuis son URL publique).
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

  // Étape 3 : attendre que le conteneur soit prêt (rapide pour des images)
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

// Carrousel Facebook : chaque image est d'abord uploadée sans être publiée
// (/photos, published=false) pour obtenir un photo_id, puis un seul post
// /feed référence toutes les photos via attached_media.
function publishCarouselToFacebook(imageUrls, caption, account) {
  const suffix = account === 'kinesportif' ? '_KINESPORTIF' : '';
  const pageId = props.getProperty(`FB_PAGE_ID${suffix}`);
  const token = props.getProperty(`FB_PAGE_TOKEN${suffix}`);

  if (!imageUrls || imageUrls.length < 2) {
    throw new Error(`Carrousel Facebook : il faut au moins 2 images (reçu : ${imageUrls ? imageUrls.length : 0})`);
  }

  // Étape 1 : uploader chaque image sans la publier
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

function sendErrorEmail(subject, details, severity) {
  const icon = severity === 'critique' ? '🔴' : '🟡';
  const fullSubject = `[Pipeline Carrousel] ${icon} ${subject}`;
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

// ============ RENOUVELLEMENT DES TOKENS META ============
// Ce projet Apps Script a SES PROPRES Propriétés du script, séparées de
// celles du pipeline vidéo — une copie figée des tokens au moment où tu les
// as collés. Sans ce renouvellement, ils expirent silencieusement au bout
// de quelques semaines/mois. Même App Meta et mêmes Pages que le pipeline
// vidéo (FB_APP_ID et les deux Page ID Facebook sont les tiens, réels).
const FB_APP_ID = '1601080298464923';
const FB_PAGE_ID_KINEPULSE_NUM = '1277403592131553';
const FB_PAGE_ID_KINESPORTIF_NUM = '1242305195640340';

function renewAllTokens() {
  try {
    renewFacebookUserToken();
  } catch (err) {
    sendErrorEmail('Carrousel — Échec renouvellement token utilisateur Facebook', err.message, 'critique');
    return; // sans token utilisateur frais, inutile de continuer
  }

  try {
    renewFacebookPageToken('kinepulse', FB_PAGE_ID_KINEPULSE_NUM);
  } catch (err) {
    sendErrorEmail('Carrousel — Échec renouvellement Page Token KinéPulse', err.message, 'critique');
  }

  try {
    renewFacebookPageToken('kinesportif', FB_PAGE_ID_KINESPORTIF_NUM);
  } catch (err) {
    sendErrorEmail('Carrousel — Échec renouvellement Page Token KinéSportif', err.message, 'critique');
  }

  try {
    renewInstagramToken('kinepulse');
  } catch (err) {
    sendErrorEmail('Carrousel — Échec renouvellement token Instagram KinéPulse', err.message, 'critique');
  }

  try {
    renewInstagramToken('kinesportif');
  } catch (err) {
    sendErrorEmail('Carrousel — Échec renouvellement token Instagram KinéSportif', err.message, 'critique');
  }
}

function renewFacebookUserToken() {
  const appSecret = props.getProperty('FB_APP_SECRET');
  const currentUserToken = props.getProperty('FB_USER_TOKEN');

  const exchangeRes = UrlFetchApp.fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${appSecret}&fb_exchange_token=${currentUserToken}`
  );
  const newUserToken = JSON.parse(exchangeRes.getContentText()).access_token;
  props.setProperty('FB_USER_TOKEN', newUserToken);
}

function renewFacebookPageToken(account, pageId) {
  const userToken = props.getProperty('FB_USER_TOKEN');
  const suffix = account === 'kinesportif' ? '_KINESPORTIF' : '';

  const pagesRes = UrlFetchApp.fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`
  );
  const pages = JSON.parse(pagesRes.getContentText()).data;
  const page = pages.find(function(p) { return p.id === pageId; });

  if (page) {
    props.setProperty(`FB_PAGE_TOKEN${suffix}`, page.access_token);
  } else {
    throw new Error(`Page ${pageId} (${account}) introuvable dans /me/accounts.`);
  }
}

function renewInstagramToken(account) {
  const suffix = account === 'kinesportif' ? '_KINESPORTIF' : '';
  const currentToken = props.getProperty(`IG_ACCESS_TOKEN${suffix}`);

  const res = UrlFetchApp.fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`
  );
  const newToken = JSON.parse(res.getContentText()).access_token;
  props.setProperty(`IG_ACCESS_TOKEN${suffix}`, newToken);
}

function testRenewal() {
  renewAllTokens();
  Logger.log('FB Page Token KinéPulse: ' + props.getProperty('FB_PAGE_TOKEN').substring(0, 20) + '...');
  Logger.log('FB Page Token KinéSportif: ' + props.getProperty('FB_PAGE_TOKEN_KINESPORTIF').substring(0, 20) + '...');
  Logger.log('IG Token KinéPulse: ' + props.getProperty('IG_ACCESS_TOKEN').substring(0, 20) + '...');
  Logger.log('IG Token KinéSportif: ' + props.getProperty('IG_ACCESS_TOKEN_KINESPORTIF').substring(0, 20) + '...');
}

// ============ INSTALLATION DES DÉCLENCHEURS (à exécuter UNE SEULE FOIS) ============
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    const fn = t.getHandlerFunction();
    if (fn === 'checkPendingApprovals' || fn === 'checkPeakTimePublish' || fn === 'renewAllTokens') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Vérifie les approbations en attente toutes les 30 minutes
  ScriptApp.newTrigger('checkPendingApprovals')
    .timeBased()
    .everyMinutes(30)
    .create();

  // Renouvelle les tokens Meta chaque semaine (avant qu'ils n'expirent)
  ScriptApp.newTrigger('renewAllTokens')
    .timeBased()
    .everyDays(7)
    .create();

  // Vérifie le créneau de pointe toutes les heures
  ScriptApp.newTrigger('checkPeakTimePublish')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('Déclencheurs installés : checkPendingApprovals (30 min), renewAllTokens (7 jours), checkPeakTimePublish (1h).');
}

// ============ TEST ============
function testEmailCarouselKinePulse() {
  queueBatchForApproval('kinepulse', ['facebook', 'instagram'],
    [
      'https://picsum.photos/seed/kp1/1080/1350',
      'https://picsum.photos/seed/kp2/1080/1350',
      'https://picsum.photos/seed/kp3/1080/1350'
    ],
    'Ceci est un test du carrousel 🎉', '#test #kinepulse');
}

function testEmailCarouselKineSportif() {
  queueBatchForApproval('kinesportif', ['facebook', 'instagram'],
    [
      'https://picsum.photos/seed/ks1/1080/1350',
      'https://picsum.photos/seed/ks2/1080/1350',
      'https://picsum.photos/seed/ks3/1080/1350'
    ],
    'This is a carousel test 🎉', '#test #kinesportif');
}

// ============ MAINTENANCE ============
function fixHeaderRow() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  sheet.getRange(1, 1, 1, 10).setValues([
    ['id', 'batch_id', 'account', 'platform', 'media_urls', 'caption', 'hashtags', 'status', 'created_at', 'token']
  ]);
  Logger.log('En-tête corrigé.');
}

function weeklySheetBackup() {
  const original = DriveApp.getFileById(SHEET_ID);
  const dateStr = Utilities.formatDate(new Date(), 'GMT-4', 'yyyy-MM-dd');
  const backupName = `Pipeline Carrousel — Backup ${dateStr}`;

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

function rejectTestRows() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Queue');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const mediaUrlsCol = headers.indexOf('media_urls');
  const statusCol = headers.indexOf('status');
  const targets = ['pending', 'approved'];

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const mediaUrls = String(data[i][mediaUrlsCol] || '');
    const status = data[i][statusCol];
    const isTest = mediaUrls.indexOf('picsum.photos') !== -1;
    if (isTest && targets.indexOf(status) !== -1) {
      sheet.getRange(i + 1, statusCol + 1).setValue('rejected');
      count++;
    }
  }
  Logger.log(count + ' lignes de test rejetées.');
}
