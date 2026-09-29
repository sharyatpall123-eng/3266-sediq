import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const utilsPath = path.resolve(
  root,
  "node_modules",
  "whatsapp-web.js",
  "src",
  "util",
  "Injected",
  "Utils.js"
);

const puppeteerPath = path.resolve(
  root,
  "node_modules",
  "whatsapp-web.js",
  "src",
  "util",
  "Puppeteer.js"
);

function requireFile(file) {
  if (!fs.existsSync(file)) {
    console.error(`❌ Required whatsapp-web.js file was not found: ${file}`);
    process.exit(1);
  }
}

function writeIfChanged(file, before, after) {
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    return true;
  }
  return false;
}

requireFile(utilsPath);

let utils = fs.readFileSync(utilsPath, "utf8");
const originalUtils = utils;
const messages = [];

// ------------------------------------------------------------------
// 1) Existing AZI media fix: keep prepared MediaData.__x_id from
//    overwriting/colliding with the real outgoing WhatsApp message ID.
// ------------------------------------------------------------------
if (!utils.includes("AZI WMS FIX: media __x_id cleanup")) {
  if (utils.includes("delete message.__x_id;")) {
    messages.push("✅ media __x_id patch already present");
  } else {
    const re = /(\.\.\.extraOptions,\r?\n\s*};)(\r?\n\s*\/\/ Bot's won't reply if canonicalUrl is set \(linking\))/;
    if (re.test(utils)) {
      utils = utils.replace(
        re,
        `$1\n\n        // AZI WMS FIX: media __x_id cleanup\n        // Do not let MediaData's private id replace the real message id.\n        delete message.__x_id;$2`
      );
      messages.push("✅ media __x_id patch applied");
    } else {
      messages.push("ℹ️ media __x_id patch target changed upstream; skipped");
    }
  }
} else {
  messages.push("✅ media __x_id patch already present");
}

// ------------------------------------------------------------------
// 2) WhatsApp Web compatibility: recent builds can return the chat
//    directly from findOrCreateLatestChat(), while older builds return
//    { chat }. Accept both. This protects Client.sendMessage/getChat.
// ------------------------------------------------------------------
if (!utils.includes("AZI WMS FIX: accept direct chat result")) {
  const oldBlock = /chat\s*=\s*\n?\s*window\.require\('WAWebCollections'\)\.Chat\.get\(chatWid\)\s*\|\|\s*\n?\s*\(\s*\n?\s*await window\s*\n?\s*\.require\('WAWebFindChatAction'\)\s*\n?\s*\.findOrCreateLatestChat\(chatWid\)\s*\n?\s*\)\?\.chat;/m;

  if (oldBlock.test(utils)) {
    utils = utils.replace(
      oldBlock,
      `chat = window.require('WAWebCollections').Chat.get(chatWid);\n            if (!chat) {\n                // AZI WMS FIX: accept direct chat result or { chat }.\n                const foundChat = await window\n                    .require('WAWebFindChatAction')\n                    .findOrCreateLatestChat(chatWid);\n                chat = foundChat?.chat || foundChat || null;\n            }`
    );
    messages.push("✅ getChat direct-result compatibility patch applied");
  } else if (/foundChat\?\.chat \|\| foundChat/.test(utils)) {
    messages.push("✅ getChat direct-result compatibility already present upstream");
  } else {
    messages.push("ℹ️ getChat block changed upstream; compatibility patch skipped");
  }
} else {
  messages.push("✅ getChat direct-result compatibility patch already present");
}

// ------------------------------------------------------------------
// 3) WhatsApp Web 2026 compatibility: some message keys expose `$1`
//    instead of `_serialized`. Restore `_serialized` in serialized models
//    so downstream Message/getChat code does not receive undefined IDs.
// ------------------------------------------------------------------
if (!utils.includes("AZI WMS FIX: restore renamed message key")) {
  const anchor = /\n\s*delete msg\.pendingAckUpdate;/;
  if (anchor.test(utils)) {
    utils = utils.replace(
      anchor,
      `\n        // AZI WMS FIX: restore renamed message key (_serialized -> $1).\n        if (typeof msg.id === 'object' && msg.id && msg.id._serialized == null) {\n            const serializedId = msg.id.$1 ?? undefined;\n            if (serializedId) {\n                msg.id = Object.assign({}, msg.id, { _serialized: serializedId });\n            }\n        }\n\n        delete msg.pendingAckUpdate;`
    );
    messages.push("✅ message key _serialized/$1 compatibility patch applied");
  } else {
    messages.push("ℹ️ message-model anchor changed upstream; id patch skipped");
  }
} else {
  messages.push("✅ message key compatibility patch already present");
}

writeIfChanged(utilsPath, originalUtils, utils);

// ------------------------------------------------------------------
// 4) Prevent the known QR reinjection race from crashing with
//    "onQRChangedEvent already exists" after logout/re-pairing.
// ------------------------------------------------------------------
if (fs.existsSync(puppeteerPath)) {
  let pup = fs.readFileSync(puppeteerPath, "utf8");
  const originalPup = pup;

  if (!pup.includes("AZI WMS FIX: tolerate duplicate page binding")) {
    const exposeLine = /\n(\s*)await page\.exposeFunction\(name, fn\);/;
    if (exposeLine.test(pup)) {
      pup = pup.replace(
        exposeLine,
        `\n$1// AZI WMS FIX: tolerate duplicate page binding during navigation/relogin.\n$1try {\n$1    await page.exposeFunction(name, fn);\n$1} catch (error) {\n$1    if (!/already exists/i.test(String(error?.message || error))) {\n$1        throw error;\n$1    }\n$1}`
      );
      messages.push("✅ duplicate QR/page-binding patch applied");
    } else {
      messages.push("ℹ️ page-binding helper changed upstream; QR patch skipped");
    }
  } else {
    messages.push("✅ duplicate QR/page-binding patch already present");
  }

  writeIfChanged(puppeteerPath, originalPup, pup);
}

for (const message of messages) {
  console.log(message);
}

console.log("✅ AZI WMS whatsapp-web.js compatibility patch finished.");
