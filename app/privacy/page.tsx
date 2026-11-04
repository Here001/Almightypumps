import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · Almighty Pumps",
  description: "How Almighty Pumps collects, uses, shares and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="4 November 2026">
      <p>
        This policy explains what personal data Almighty Pumps (“we”, “us”) collects when you use almightypumps.com, why we
        collect it, who we share it with and the choices you have. We follow the Nigeria Data Protection Act 2023 (NDPA).
        If anything here is unclear, email <a href="mailto:hello@almightypumps.com">hello@almightypumps.com</a>.
      </p>

      <h2>1. Who we are</h2>
      <p>Almighty Pumps is an online platform based in Lagos, Nigeria. We are the data controller for the personal data described here. Contact: <a href="mailto:hello@almightypumps.com">hello@almightypumps.com</a>.</p>

      <h2>2. What we collect</h2>
      <ul>
        <li><b>Account:</b> your name, email address, phone number (optional) and password. We store passwords only as a one-way hash; we can&apos;t read them.</li>
        <li><b>Wallet and payments:</b> your Naira balance, top-ups, charges, refunds and withdrawals. Card and bank payments are processed by Flutterwave; we do not receive or store your full card number. For withdrawals we keep the bank name, account number and account name you give us.</li>
        <li><b>Orders:</b> the details needed to deliver what you buy, e.g. the link or username for a social-growth order, the app you need a verification code for (and the SMS code we show you), gift-card or shop orders.</li>
        <li><b>eSIM orders:</b> your phone&apos;s IMEI number and, if you keep an existing number, the transfer details (number, carrier, account number, transfer PIN, ZIP code and account holder&apos;s name). Transfer details are stored encrypted and deleted once your order is delivered or refunded.</li>
        <li><b>Sellers:</b> shop name, contact phone, what you sell, payout bank details, ID type and ID number, and your shop picture. ID and full account numbers are visible only to our admins.</li>
        <li><b>P2P marketplace:</b> your ads, purchases, trade messages, delivery proof, disputes and their outcome.</li>
        <li><b>Usage:</b> which pages and sections of the site are visited, linked to a random cookie ID (and to your account if you are logged in). We do not store your IP address or device details for this.</li>
        <li><b>Security:</b> to stop password guessing and abuse we count requests per network and per account. These counters are scrambled (hashed) so they don&apos;t contain your IP address or email, and are deleted after a day.</li>
        <li><b>Messages to us:</b> anything you send to our email or support.</li>
      </ul>

      <h2>3. Why we use it (and our legal basis)</h2>
      <ul>
        <li><b>To provide the services you ask for</b>: your account, wallet, orders, eSIMs, the marketplace and escrow (performance of a contract).</li>
        <li><b>To keep the platform safe</b>: preventing fraud, stolen-card top-ups, fake accounts, bots and abuse; resolving disputes (legitimate interests, and legal obligations).</li>
        <li><b>To meet legal duties</b>: accounting, tax, anti-money-laundering and lawful requests from authorities (legal obligation).</li>
        <li><b>To improve the site</b>: understanding which sections are used (legitimate interests).</li>
        <li><b>To contact you</b> about your account, orders and important changes (performance of a contract; marketing only with your consent).</li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h2>4. Who we share it with</h2>
      <p>We share only what each service needs to do its job:</p>
      <ul>
        <li><b>Flutterwave</b>: processes wallet top-ups.</li>
        <li><b>Social-growth providers</b>: receive the link or username and quantity of your order, not your name or contact details.</li>
        <li><b>TextVerified</b>: provides the numbers for verification codes; receives which app the code is for.</li>
        <li><b>Our eSIM supplier</b>: receives the IMEI and, if you keep your number, the transfer details needed to set up your line.</li>
        <li><b>Cloudflare Turnstile</b>: checks that sign-ups and log-ins come from real people, not bots. Turnstile collects limited information from your browser for this purpose; see Cloudflare&apos;s <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noreferrer">Turnstile Privacy Addendum</a>.</li>
        <li><b>Hosting and email</b>: Vercel (website hosting), Neon (database, located in the EU) and Zoho (our email).</li>
        <li><b>Other users</b>: in the P2P marketplace, buyers see the seller&apos;s shop name, picture, ratings and ad answers; sellers see what a buyer ordered and their trade messages.</li>
        <li><b>Authorities</b>: when the law requires it, or to protect users from fraud.</li>
      </ul>
      <p>Some of these providers process data outside Nigeria (for example in the EU or the United States). Where that happens we rely on the safeguards allowed by the NDPA, such as the provider&apos;s contractual data-protection commitments.</p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>Account data: while your account is open, and for a reasonable period after you close it to settle any balance or dispute.</li>
        <li>Wallet, payment and order records: as long as the law requires for financial records (generally up to 6 years).</li>
        <li>eSIM number-transfer details: deleted as soon as the order is delivered or refunded.</li>
        <li>Security counters: deleted after one day.</li>
      </ul>

      <h2>6. Cookies and similar storage</h2>
      <ul>
        <li><b>ap_session</b>: keeps you logged in. With “Remember me” it lasts 30 days; otherwise it ends when you close your browser.</li>
        <li><b>ap_vid</b>: a random ID used to count page visits (see “Usage” above).</li>
        <li>Your browser also remembers your settings on your device only: theme, ₦/$ display, hidden balance and, if you ticked “Remember me”, your email address (never your password).</li>
        <li>Cloudflare Turnstile may use storage needed for the bot check.</li>
      </ul>

      <h2>7. How we protect it</h2>
      <p>Encrypted connections (https) everywhere, hashed passwords, encrypted storage for sensitive details such as eSIM transfer information and provider keys, limits on login attempts, a bot check, and admin-only access to ID and bank details. No system is perfectly secure; if a breach affects you, we will tell you and the regulator as the law requires.</p>

      <h2>8. Your rights</h2>
      <p>Under the NDPA you can ask us to: see a copy of your data; correct it; delete it (where we don&apos;t need to keep it by law); restrict or object to how we use it; receive it in a portable format; and withdraw consent you gave us. Email <a href="mailto:hello@almightypumps.com">hello@almightypumps.com</a> from your account email and we will reply within 30 days. If you&apos;re unhappy with our answer you can complain to the Nigeria Data Protection Commission (NDPC).</p>

      <h2>9. Age</h2>
      <p>Almighty Pumps is for people aged 18 and over. We do not knowingly collect data from children.</p>

      <h2>10. Changes</h2>
      <p>We may update this policy. We will change the date at the top and, for important changes, tell you by email or on the site.</p>
    </LegalPage>
  );
}
