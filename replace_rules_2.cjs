const fs = require('fs');
let text = fs.readFileSync('firestore.rules', 'utf8');

text = text.replace(
/function isSameGuild\(guildId\) \{\n\s*let uData = getUserData\(\);\n\s*return isSignedIn\(\) && \(\n\s*isSuperAdmin\(\) || \n\s*\(uData != null && uData\.guildId == guildId\) ||\n\s*\(uData != null && 'allowedGuilds' in uData && guildId in uData\.allowedGuilds\)\n\s*\);\n\s*\}/g,
`function isSameGuild(guildId) {
       let uData = getUserData();
       return isSignedIn() && (
         isSuperAdmin() || 
         (guildId == '') ||
         (uData != null && uData.guildId == guildId) ||
         (uData != null && 'allowedGuilds' in uData && guildId in uData.allowedGuilds)
       );
    }`
);

fs.writeFileSync('firestore.rules', text);
console.log('Done isSameGuild update!');
