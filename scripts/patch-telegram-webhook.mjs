import fs from 'node:fs';

const routePath = new URL('../src/app/api/deposits/route.ts', import.meta.url);
const source = fs.readFileSync(routePath, 'utf8');
const marker = '// Gửi webhook thông báo tới Telegram Bot';
const markerIndex = source.indexOf(marker);
const bodyKeywordIndex = source.indexOf('body: JSON.stringify({', markerIndex);
const bodyLineStart = source.lastIndexOf('\n', bodyKeywordIndex) + 1;
const indent = source.slice(bodyLineStart, bodyKeywordIndex);
const bodyEndToken = indent + '}),';
const bodyEndIndex = source.indexOf(bodyEndToken, bodyKeywordIndex);

if (markerIndex === -1 || bodyKeywordIndex === -1 || bodyEndIndex === -1) {
  throw new Error('Không tìm thấy payload Telegram webhook trong deposits route');
}

const inner = indent + '  ';
const replacement = `${indent}body: JSON.stringify({
${inner}// Trường cũ được giữ để bot vẫn tương thích trong lúc deploy lần lượt.
${inner}id: deposit._id.toString(),
${inner}title: \`${'${deposit.fullName}'} (${'${deposit.phone}'})\`,
${inner}type: \`${'${actionParts.join(" + ")}'} (Bởi ${'${data.actorName}'} lúc ${'${depositTime}'})\`,

${inner}// Payload có cấu trúc cho định dạng Telegram mới.
${inner}fullName: deposit.fullName,
${inner}phone: deposit.phone,
${inner}cards: data.cards,
${inner}balls: data.balls,
${inner}cardAction: isTakingCards ? "Lấy" : "Gửi",
${inner}ballAction: isTakingBalls ? "Lấy" : "Gửi",
${inner}actorName: data.actorName,
${inner}depositTime,
${inner}depositDate,
${indent}}),`;

const bodyEnd = bodyEndIndex + bodyEndToken.length;
const updated = source.slice(0, bodyLineStart) + replacement + source.slice(bodyEnd);

if (updated !== source) {
  fs.writeFileSync(routePath, updated, 'utf8');
  console.log('Đã cập nhật Telegram webhook payload trong deposits route');
} else {
  console.log('Telegram webhook payload đã ở phiên bản mới');
}
