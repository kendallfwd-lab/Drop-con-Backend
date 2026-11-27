const resendEndpoint = 'https://api.resend.com/emails';

function config() {
  const provider = (process.env.MAIL_PROVIDER || 'console').trim().toLowerCase();
  const from = process.env.EMAIL_FROM?.trim();
  const apiKey = process.env.MAIL_API_KEY?.trim();
  return { provider, from, apiKey };
}

export function mailStatus() {
  const { provider, from, apiKey } = config();
  return { provider, configured: provider === 'console' || (provider === 'resend' && Boolean(from && apiKey)) };
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
  const { provider, from, apiKey } = config();
  if (provider === 'console') {
    if (process.env.NODE_ENV === 'production') throw new Error('Configurá MAIL_PROVIDER=resend para enviar correos en producción.');
    console.info(`Password reset requested for ${to}: ${resetUrl}`);
    return { provider, id: 'console' };
  }
  if (provider !== 'resend' || !from || !apiKey) throw new Error('Configuración de correo incompleta.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(resendEndpoint, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], subject: 'Restablecé tu contraseña de DROP ZONE CR',
        text: `Recibimos una solicitud para restablecer tu contraseña. Abrí este enlace dentro de 30 minutos: ${resetUrl}\n\nSi no solicitaste este cambio, ignorá este correo.`,
      }),
    });
    if (!response.ok) throw new Error(`Proveedor de correo rechazó el envío (${response.status}).`);
    const body = await response.json().catch(() => ({}));
    return { provider, id: body.id || null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendPasswordResetCodeEmail({ to, code }) {
  const { provider, from, apiKey } = config();
  const text = `Tu codigo de verificacion de DROP ZONE CR es: ${code}\n\nVence en 10 minutos. No compartas este codigo con nadie. Si no solicitaste cambiar tu contrasena, ignora este correo.`;
  if (provider === 'console') {
    if (process.env.NODE_ENV === 'production') throw new Error('Configura MAIL_PROVIDER=resend para enviar correos en produccion.');
    console.info(`Password reset code requested for ${to}: ${code}`);
    return { provider, id: 'console' };
  }
  if (provider !== 'resend' || !from || !apiKey) throw new Error('Configuracion de correo incompleta.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(resendEndpoint, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], subject: 'Codigo de verificacion de DROP ZONE CR', text,
      }),
    });
    if (!response.ok) throw new Error(`Proveedor de correo rechazo el envio (${response.status}).`);
    const body = await response.json().catch(() => ({}));
    return { provider, id: body.id || null };
  } finally {
    clearTimeout(timeout);
  }
}
