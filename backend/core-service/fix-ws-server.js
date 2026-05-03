const fs = require('fs');

const file = '/opt/openclaw/core-service/dist/websocket/ws-server.js';
let c = fs.readFileSync(file, 'utf8');

// Find the exact broken pattern
const broken = 'this.eventBus.emit("group_msg"`group_msg:${session.groupId}`, {';
const newCode = 'const groupService = require("../soul/group-service.js");\n            groupService.GroupService.getInstance().handleChatMessage({';

if (c.includes(broken)) {
    c = c.replace(broken, newCode);
    console.log('Fixed broken event emit');
} else {
    console.log('Broken pattern not found');
    const idx = c.indexOf('group_msg');
    if (idx > 0) {
        console.log('Found at:', idx);
        console.log(c.substring(idx-10, idx+50));
    }
}

fs.writeFileSync(file, c);
console.log('Done');
