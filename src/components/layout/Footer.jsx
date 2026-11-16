import { ArrowRight, MapPin, Phone } from 'lucide-react';
import { Brand, InstagramBrandIcon, WhatsAppLink } from '../common/Shared.jsx';

export default function Footer({ settings }) {
  return <>
    <div className="footer-transition" aria-hidden="true" />
    <footer id="contacto" className="footer"><div className="container footer__main"><div className="footer__brand"><Brand compact /><p>{settings.tagline}</p></div><div className="footer__links"><span className="location-link"><MapPin size={17} />{settings.location}</span><a className="phone-link" href={`tel:+${settings.whatsappPhone}`}><Phone size={17} />{settings.displayPhone}</a><a className="instagram-link" href={settings.instagramUrl} target="_blank" rel="noopener noreferrer"><InstagramBrandIcon />{settings.instagramHandle}</a></div><WhatsAppLink phone={settings.whatsappPhone} className="button button--whatsapp">Escribenos a nuestro WhatsApp <ArrowRight size={17} /></WhatsAppLink></div><div className="container footer__bottom"><span>© 2026 Drop Zone CR. All rights reserved.</span><span className="footer__credit">Website designed &amp; developed by <a href="https://github.com/kendallfwd-lab" target="_blank" rel="noopener noreferrer"><strong>Kendall</strong></a><span aria-hidden="true"> · </span><a href="https://github.com/kendallfwd-lab" target="_blank" rel="noopener noreferrer">Kendall | Full Stack Developer</a></span></div></footer>
  </>;
}
