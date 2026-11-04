import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service · Almighty Pumps",
  description: "The rules for using Almighty Pumps: accounts, wallet, services, the P2P marketplace, refunds and more.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="4 November 2026">
      <p>
        These terms are the agreement between you and Almighty Pumps (“we”, “us”) for using almightypumps.com. By creating an
        account or using the site you agree to them. Please also read our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>1. Your account</h2>
      <ul>
        <li>You must be 18 or older and give true details.</li>
        <li>Keep your password private. You are responsible for what happens on your account. Tell us straight away at <a href="mailto:hello@almightypumps.com">hello@almightypumps.com</a> if you think someone else has used it.</li>
        <li>One person, one account, unless we agree otherwise.</li>
      </ul>

      <h2>2. Your wallet</h2>
      <ul>
        <li>Your wallet holds Naira you have topped up or earned, to spend on the site. It is not a bank account and does not earn interest. Dollar amounts on the site are estimates for display only; you are always charged in Naira.</li>
        <li>Top-ups are processed by Flutterwave. The minimum top-up is ₦1,000.</li>
        <li>When you order, the price is usually <b>set aside</b> (held) and only taken when the order is delivered. If it can&apos;t be delivered, the held money returns to your wallet.</li>
        <li>You can withdraw your available balance to a Nigerian bank account in your own name (minimum ₦2,000). Withdrawals are checked and paid by our team, usually within 24 hours on working days. We may delay or refuse a withdrawal while we check for fraud (for example, money topped up with a card and not spent).</li>
      </ul>

      <h2>3. Our services</h2>
      <h3>Social growth (Boost Account)</h3>
      <ul>
        <li>You pay for followers, likes, views and similar services delivered by third-party providers. Delivery times are estimates.</li>
        <li>If an order is only partly delivered, you are charged for what was delivered and the rest is refunded. If it can&apos;t start, you are refunded in full.</li>
        <li>Social platforms can remove followers or engagement at any time. Unless a service says it includes a refill period, we can&apos;t guarantee numbers stay.</li>
        <li>You must have the right to promote the account or link you give, and keep it public while the order runs.</li>
      </ul>
      <h3>Verification codes</h3>
      <ul>
        <li>You get a temporary US number to receive a one-time SMS code. You are charged only if a code arrives; otherwise you are refunded.</li>
        <li>You must not use these numbers for fraud, to impersonate anyone, or in a way that breaks the law.</li>
      </ul>
      <h3>eSIMs</h3>
      <ul>
        <li>eSIMs are set up by our team after you order, using the phone IMEI you give. The eSIM works only on that exact phone, which must support eSIM and be unlocked. Check your IMEI carefully; we can&apos;t refund an eSIM that was delivered for a wrong IMEI you entered.</li>
        <li>If you keep an existing number, your details must be correct and the number must be yours. Number transfers can be refused by your old carrier; if we can&apos;t complete your order, we refund you.</li>
        <li>Plans run for the length you bought. Network coverage, speeds and availability are provided by the network operator and can change.</li>
      </ul>
      <h3>Shop items and gift cards</h3>
      <ul>
        <li>Codes delivered instantly can&apos;t be refunded once shown to you, unless the code doesn&apos;t work and the supplier confirms it.</li>
      </ul>

      <h2>4. P2P marketplace and escrow</h2>
      <ul>
        <li>Only sellers we have verified can post ads. We check sellers but we are not the seller of items on the marketplace.</li>
        <li>When you buy, your payment is held in escrow. The seller has <b>72 hours</b> to deliver, or you can cancel for a refund. After delivery you have <b>48 hours</b> to confirm or open a dispute; if you do nothing, the payment is released to the seller.</li>
        <li>Sellers pay a <b>3% fee</b> on each completed sale, taken from the payout.</li>
        <li>In a dispute, we review the evidence from both sides (messages, delivery proof) and decide whether to refund the buyer or pay the seller. Our decision on the escrowed funds is final on the platform.</li>
        <li><b>Prohibited items</b> include: counterfeit or replica goods; fake or forged ID, certificates or financial documents; social media, gaming or email accounts; stolen cards, “logs”, hacking tools or anyone&apos;s personal data; weapons, drugs and anything illegal in Nigeria. We remove such ads and may close the account.</li>
      </ul>

      <h2>5. Reseller API</h2>
      <p>If you use our API, keep your API key secret, stay within the request limits, and follow these terms for every order placed through your key. You are responsible for orders and charges made with your key.</p>

      <h2>6. Things you must not do</h2>
      <ul>
        <li>Break the law, defraud anyone, or launder money.</li>
        <li>Top up with a card or account that isn&apos;t yours.</li>
        <li>Use bots, scrape the site, try to get around our limits or security, or attack the site.</li>
        <li>Harass other users or post misleading ads.</li>
      </ul>

      <h2>7. Suspension and closing</h2>
      <p>We may suspend or close an account that breaks these terms or is linked to fraud, and hold funds while we investigate or where the law requires. You can close your account at any time by emailing us; we will pay out any balance you are entitled to, minus anything owed.</p>

      <h2>8. Our responsibility</h2>
      <ul>
        <li>We work hard to keep the site running, but it may sometimes be unavailable, and services from third-party providers can be delayed or fail.</li>
        <li>As far as the law allows, we are not responsible for indirect losses (such as lost profits or lost followers), and our total responsibility for any claim is limited to the amount you paid us for the order concerned.</li>
        <li>Nothing in these terms removes rights you have under Nigerian consumer protection law.</li>
      </ul>

      <h2>9. Changes</h2>
      <p>We may update these terms or our prices. Changes apply from the date shown at the top; orders you already placed keep the price you paid.</p>

      <h2>10. Law and complaints</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Lagos State have jurisdiction. If something goes wrong, email <a href="mailto:hello@almightypumps.com">hello@almightypumps.com</a> first and we will try to fix it quickly.</p>
    </LegalPage>
  );
}
