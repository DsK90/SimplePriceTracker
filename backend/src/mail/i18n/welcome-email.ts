import type { MailLocale } from './mail-locale';
import { PRODUCT_TAGLINE } from './brand-tagline';

type Pack = { subject: string; body: string };

const packs: Record<MailLocale, Pack> = {
  de: {
    subject: 'Willkommen bei PriceFly',
    body:
      PRODUCT_TAGLINE.de +
      '\n\n' +
      'Vielen Dank für Ihre Registrierung. Im Free-Tarif können Sie bis zu 5 aktive Produkte verfolgen. ' +
      'E-Mail-Preisalarme sind optional und auf 2 Produkte begrenzt (10 bei Pro); Push- und In-App-Alarme sind unbegrenzt. ' +
      'Die Fair-Use-Richtlinie finden Sie auf der Website.',
  },
  en: {
    subject: 'Welcome to PriceFly',
    body:
      PRODUCT_TAGLINE.en +
      '\n\n' +
      'Thanks for signing up. On the free plan you can track up to 5 active products. ' +
      'Email price alerts are optional and limited to 2 products (10 on Pro); push and in-app alerts are unlimited. ' +
      'See our Fair Use Policy on the website.',
  },
  fr: {
    subject: 'Bienvenue sur PriceFly',
    body:
      PRODUCT_TAGLINE.fr +
      '\n\n' +
      'Merci de vous être inscrit. Avec l’offre gratuite, vous pouvez suivre jusqu’à 5 produits actifs. ' +
      'Les alertes par e-mail sont facultatives et limitées à 2 produits (10 avec Pro) ; les alertes push et in-app sont illimitées. ' +
      'Consultez notre politique d’usage équitable sur le site.',
  },
  es: {
    subject: 'Bienvenido a PriceFly',
    body:
      PRODUCT_TAGLINE.es +
      '\n\n' +
      'Gracias por registrarte. En el plan gratuito puedes seguir hasta 5 productos activos. ' +
      'Las alertas por correo son opcionales y limitadas a 2 productos (10 en Pro); las alertas push y en la app son ilimitadas. ' +
      'Consulta la política de uso justo en el sitio web.',
  },
  it: {
    subject: 'Benvenuto su PriceFly',
    body:
      PRODUCT_TAGLINE.it +
      '\n\n' +
      'Grazie per esserti registrato. Con il piano gratuito puoi monitorare fino a 5 prodotti attivi. ' +
      'Gli avvisi e-mail sono facoltativi e limitati a 2 prodotti (10 con Pro); push e in-app sono illimitati. ' +
      'Vedi la politica di uso corretto sul sito.',
  },
  da: {
    subject: 'Velkommen til PriceFly',
    body:
      PRODUCT_TAGLINE.da +
      '\n\n' +
      'Tak for din tilmelding. På gratisplanen kan du følge op til 5 aktive produkter. ' +
      'E-mail-prisalarmer er valgfrie og begrænset til 2 produkter (10 på Pro); push og in-app er ubegrænsede. ' +
      'Se vores retningslinjer for fair brug på websitet.',
  },
  ru: {
    subject: 'Добро пожаловать в PriceFly',
    body:
      PRODUCT_TAGLINE.ru +
      '\n\n' +
      'Спасибо за регистрацию. На бесплатном тарифе можно отслеживать до 5 активных товаров. ' +
      'Почтовые оповещения о цене необязательны и ограничены 2 товарами (10 в Pro); push и в приложении без ограничений. ' +
      'Политика добросовестного использования — на сайте.',
  },
  zh: {
    subject: '欢迎使用 PriceFly',
    body:
      PRODUCT_TAGLINE.zh +
      '\n\n' +
      '感谢注册。免费版最多可跟踪 5 个活跃商品。' +
      '邮件降价提醒为可选，最多 2 个商品（专业版 10 个）；推送与应用内提醒不限。' +
      '公平使用政策请见网站。',
  },
};

export function welcomeEmailSubject(locale: MailLocale): string {
  return packs[locale].subject;
}

export function welcomeEmailBody(locale: MailLocale): string {
  return packs[locale].body;
}
