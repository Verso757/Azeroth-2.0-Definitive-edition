const fs = require('fs');
let text = fs.readFileSync('firestore.rules', 'utf8');

text = text.replace(/incoming\(\)\.get\('guildId', ''\) == existing\(\)\.get\('guildId', ''\)/g, "(incoming().get('guildId', '') == existing().get('guildId', '') || existing().get('guildId', '') == '')");

fs.writeFileSync('firestore.rules', text);
console.log('Done relaxing rules!');
