import app from './index.js';

const port = Number(process.env.PORT || 3001);
const host = process.env.BIND_HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`Drop Zone API escucha en http://${host}:${port}.`));
