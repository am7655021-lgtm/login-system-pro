const http = require('http');
const data = JSON.stringify({ email: 'test@example.com', message: 'اختبار ارسال' });

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/contact',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('POST', res.statusCode, body);

    const getReq = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/messages',
      method: 'GET'
    }, res2 => {
      let b2 = '';
      res2.on('data', chunk => b2 += chunk);
      res2.on('end', () => console.log('GET /api/messages', res2.statusCode, b2));
    });
    getReq.on('error', err => console.error('GET error', err));
    getReq.end();
  });
});

req.on('error', err => console.error('POST error', err));
req.write(data);
req.end();
