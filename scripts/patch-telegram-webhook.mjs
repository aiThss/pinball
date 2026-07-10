import fs from 'node:fs';

const routePath = new URL('../src/app/api/deposits/route.ts', import.meta.url);
const source = fs.readFileSync(routePath, 'utf8');
const marker = '// Gửi webhook thông báo tới Telegram Bot';
const markerIndex = source.indexOf(marker);
const bodyStart = source.indexOf('        body: JSON.stringify({', markerIndex);
const bodyEndToken = '        }),';
const bodyEndIndex = source.indexOf(bodyEndToken, bodyStart);

if (markerIndex === -1 || bodyStart === -1 || bodyEndIndex === -1) {
  throw new Error('Không tìm thấy payload Telegram webhook trong deposits route');
}

const replacement = `        body: JSON.stringify({
          // Trường cũ được giữ để bot vẫn tương thích trong lúc deploy lần lượt.
          id: deposit._id.toString(),
          title: \`${'${deposit.fullName}'} (${'${deposit.phone}'})\`,
          type: \`${'${actionParts.join(" + ")}'} (Bởi ${'${data.actorName}'} lúc ${'${depositTime}'})\`,

          // Payload có cấu trúc cho định dạng Telegram mới.
          fullName: deposit.fullName,
          phone: deposit.phone,
          cards: data.cards,
          balls: data.balls,
          cardAction: isTakingCards ? "Lấy" : "Gửi",
          ballAction: isTakingBalls ? "Lấy" : "Gửi",
          actorName: data.actorName,
          depositTime,
          depositDate,
        }),`;

const bodyEnd = bodyEndIndex + bodyEndToken.length;
const updated = source.slice(0, bodyStart) + replacement + source.slice(bodyEnd);

if (updated !== source) {
  fs.writeFileSync(routePath, updated, 'utf8');
  console.log('Đã cập nhật Telegram webhook payload trong deposits route');
} else {
  console.log('Telegram webhook payload đã ở phiên bản mới');
}
