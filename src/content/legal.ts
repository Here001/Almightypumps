/**
 * Original Privacy Policy and Terms text (used until the admin saves an edited version in Admin → Legal pages,
 * and for "Reset to original"). Format: see src/core/miniMarkdown.ts.
 */
export type LegalKind = "privacy" | "terms";

export const LEGAL_TITLES: Record<LegalKind, string> = { privacy: "Privacy Policy", terms: "Terms of Service" };
export const LEGAL_DEFAULT_UPDATED = "2026-11-04";

const PRIVACY = `This policy explains what personal data Almighty Pumps (“we”, “us”) collects when you use almightypumps.com, why we collect it, who we share it with and the choices you have. We follow the Nigeria Data Protection Act 2023 (NDPA). If anything here is unclear, email [support@almightypumps.com](mailto:support@almightypumps.com).

## 1. Who we are
Almighty Pumps is an online platform based in Lagos, Nigeria. We are the data controller for the personal data described here. Contact: [support@almightypumps.com](mailto:support@almightypumps.com).

## 2. What we collect
- **Account:** your name, email address, phone number (optional) and password. We store passwords only as a one-way hash; we can't read them.
- **Wallet and payments:** your Naira balance, top-ups, charges, refunds and withdrawals. For bank transfer or crypto top-ups, the transaction ID or sender name you give us. Card and bank payments are processed by Flutterwave; we do not receive or store your full card number. For withdrawals we keep the bank name, account number and account name you give us. If you ask for your own bank-transfer account number, your BVN is sent to Flutterwave to open it (a banking requirement); we don't store your BVN, only the account number created for you.
- **Orders:** the details needed to deliver what you buy, e.g. the link or username for a social-growth order, the app you need a verification code for (and the SMS code we show you), gift-card or shop orders.
- **eSIM orders:** your phone's IMEI number and, if you keep an existing number, the transfer details (number, carrier, account number, transfer PIN, ZIP code and account holder's name). Transfer details are stored encrypted and deleted once your order is delivered or refunded.
- **Sellers:** shop name, contact phone, what you sell, payout bank details, ID type and ID number, and your shop picture. ID and full account numbers are visible only to our admins.
- **P2P marketplace:** your ads, purchases, trade messages, delivery proof, disputes and their outcome.
- **Usage:** which pages and sections of the site are visited, linked to a random cookie ID (and to your account if you are logged in). We do not store your IP address or device details for this.
- **Security:** to stop password guessing and abuse we count requests per network and per account. We email you a one-time code when you sign up and when you log in on a new device; we store only a scrambled copy of each code, and it stops working after 10 minutes. These counters are scrambled (hashed) so they don't contain your IP address or email, and are deleted after a day.
- **Messages to us:** anything you send to our email or support.

## 3. Why we use it (and our legal basis)
- **To provide the services you ask for**: your account, wallet, orders, eSIMs, the marketplace and escrow (performance of a contract).
- **To keep the platform safe**: preventing fraud, stolen-card top-ups, fake accounts, bots and abuse; resolving disputes (legitimate interests, and legal obligations).
- **To meet legal duties**: accounting, tax, anti-money-laundering and lawful requests from authorities (legal obligation).
- **To improve the site**: understanding which sections are used (legitimate interests).
- **To contact you** about your account, orders and important changes (performance of a contract; marketing only with your consent).

We do not sell your personal data.

## 4. Who we share it with
We share only what each service needs to do its job:
- **Flutterwave**: processes wallet top-ups.
- **Social-growth providers**: receive the link or username and quantity of your order, not your name or contact details.
- **TextVerified**: provides the numbers for verification codes; receives which app the code is for.
- **Our eSIM supplier**: receives the IMEI and, if you keep your number, the transfer details needed to set up your line.
- **Resend**: sends our emails, such as the 6-digit codes for signing up and logging in on a new device; receives your email address and first name.
- **Terminal Africa and its courier partners** (e.g. DHL, FedEx, UPS and Nigerian couriers): arrange and deliver packages you send; receive the sender's and receiver's names, phone numbers, emails and addresses and the package details.
- **Reloadly**: delivers gift cards and airtime/data; receives the phone number you top up (not your name or email).
- **eSIM Access**: provides travel eSIMs; receives which data package you bought (not your name or email).
- **Hosting and email**: Vercel (website hosting), Neon (database, located in the EU) and Zoho (our email).
- **Other users**: in the P2P marketplace, buyers see the seller's shop name, picture, ratings and ad answers; sellers see what a buyer ordered and their trade messages.
- **Authorities**: when the law requires it, or to protect users from fraud.

Some of these providers process data outside Nigeria (for example in the EU or the United States). Where that happens we rely on the safeguards allowed by the NDPA, such as the provider's contractual data-protection commitments.

## 5. How long we keep it
- Account data: while your account is open, and for a reasonable period after you close it to settle any balance or dispute.
- Wallet, payment and order records: as long as the law requires for financial records (generally up to 6 years).
- eSIM number-transfer details: deleted as soon as the order is delivered or refunded.
- Security counters: deleted after one day.

## 6. Cookies and similar storage
- **ap_session**: keeps you logged in. With “Remember me” it lasts 30 days; otherwise it ends when you close your browser.
- **ap_vid**: a random ID used to count page visits (see “Usage” above).
- Your browser also remembers your settings on your device only: theme, ₦/$ display, hidden balance and, if you ticked “Remember me”, your email address (never your password).
- **ap_device**: a random code that marks this device as one you've confirmed with an email code, so you aren't asked again for 30 days.

## 7. How we protect it
Encrypted connections (https) everywhere, hashed passwords, encrypted storage for sensitive details such as eSIM transfer information and provider keys, limits on login attempts, email codes for new sign-ups and new devices, and admin-only access to ID and bank details. No system is perfectly secure; if a breach affects you, we will tell you and the regulator as the law requires.

## 8. Your rights
Under the NDPA you can ask us to: see a copy of your data; correct it; delete it (where we don't need to keep it by law); restrict or object to how we use it; receive it in a portable format; and withdraw consent you gave us. Email [support@almightypumps.com](mailto:support@almightypumps.com) from your account email and we will reply within 30 days. If you're unhappy with our answer you can complain to the Nigeria Data Protection Commission (NDPC).

## 9. Age
Almighty Pumps is for people aged 18 and over. We do not knowingly collect data from children.

## 10. Changes
We may update this policy. We will change the date at the top and, for important changes, tell you by email or on the site.`;

const TERMS = `These terms are the agreement between you and Almighty Pumps (“we”, “us”) for using almightypumps.com. By creating an account or using the site you agree to them. Please also read our [Privacy Policy](/privacy).

## 1. Your account
- You must be 18 or older and give true details.
- Keep your password private. You are responsible for what happens on your account. Tell us straight away at [support@almightypumps.com](mailto:support@almightypumps.com) if you think someone else has used it.
- One person, one account, unless we agree otherwise.

## 2. Your wallet
- Your wallet holds Naira you have topped up or earned, to spend on the site. It is not a bank account and does not earn interest. Dollar amounts on the site are estimates for display only; you are always charged in Naira.
- Top-ups are processed by Flutterwave, or you can pay us directly by bank transfer or crypto using the details shown in your Wallet. Direct payments are added once our team confirms they arrived; crypto is credited in Naira at the rate shown when you pay, based on the amount that actually arrives (network fees are yours). Crypto sent on the wrong network or to the wrong address can't be recovered. Claiming a payment you didn't make is fraud. The minimum top-up is ₦1,000.
- When you order, the price is usually **set aside** (held) and only taken when the order is delivered. If it can't be delivered, the held money returns to your wallet.
- You can withdraw your available balance to a Nigerian bank account in your own name (minimum ₦2,000). Withdrawals are checked and paid by our team, usually within 24 hours on working days. We may delay or refuse a withdrawal while we check for fraud (for example, money topped up with a card and not spent).

## 3. Our services
### Social growth (Boost Account)
- You pay for followers, likes, views and similar services delivered by third-party providers. Delivery times are estimates.
- If an order is only partly delivered, you are charged for what was delivered and the rest is refunded. If it can't start, you are refunded in full.
- Social platforms can remove followers or engagement at any time. Unless a service says it includes a refill period, we can't guarantee numbers stay.
- You must have the right to promote the account or link you give, and keep it public while the order runs.

### Verification codes
- You get a temporary US number to receive a one-time SMS code. You are charged only if a code arrives; otherwise you are refunded.
- You must not use these numbers for fraud, to impersonate anyone, or in a way that breaks the law.

### eSIMs
- eSIMs are set up by our team after you order, using the phone IMEI you give. The eSIM works only on that exact phone, which must support eSIM and be unlocked. Check your IMEI carefully; we can't refund an eSIM that was delivered for a wrong IMEI you entered.
- If you keep an existing number, your details must be correct and the number must be yours. Number transfers can be refused by your old carrier; if we can't complete your order, we refund you.
- Plans run for the length you bought. Network coverage, speeds and availability are provided by the network operator and can change.

### Selling us gift cards or crypto
- You can only sell gift cards you lawfully own and that haven't been used. Crypto must come from a wallet you control. We pay into your wallet after we've checked the card or seen the crypto arrive, at the rate shown when you submitted. If a card turns out to be invalid or used, or the crypto doesn't arrive, we don't pay. Crypto sent on the wrong network can't be recovered.
- We may limit how much you can sell, ask for ID, refuse a trade, and report fraud to the authorities. Selling stolen or fraudulently obtained cards or crypto gets your account closed.

### Sending packages
- Packages are collected and delivered by the courier you choose (through our partner Terminal Africa). The price shown is what you pay; it is charged when you book. You can cancel for a full refund until the courier has picked the package up.
- You must describe the contents and value honestly. Don't send cash, weapons, drugs, counterfeit or stolen goods, or anything illegal to send. Couriers may refuse, hold or return a package that breaks their rules or the law, and international parcels go through customs (import duty may be collected on delivery).
- Delivery times are the courier's estimates. Lost or damaged packages are handled through the courier's claims process; we'll help you file a claim.

### Invite friends (referral bonuses)
- When a friend signs up with your invite link and spends the minimum shown on the Invite screen on paid orders, we pay the bonus shown there into your wallet (and theirs, if a friend bonus is shown). Bonus amounts, the minimum and the limits can change at any time; the amounts at the moment the friend qualifies apply.
- Bonuses are for genuine new customers. Inviting yourself with another account, fake accounts or any other abuse means no bonus, and we may take back bonuses already paid and close the accounts involved.

### When an order is pending
- Sometimes a supplier can't fulfil an order straight away. Your payment then stays on hold (not taken) and the order shows as pending until it's delivered. If we can't deliver it, we refund you in full. Contact support@almightypumps.com if an order has been pending longer than you'd like.

### Shop items and gift cards
- Codes delivered instantly can't be refunded once shown to you, unless the code doesn't work and the supplier confirms it.

## 4. P2P marketplace and escrow
- Only sellers we have verified can post ads. We check sellers but we are not the seller of items on the marketplace.
- When you buy, your payment is held in escrow. The seller has **72 hours** to deliver, or you can cancel for a refund. After delivery you have **48 hours** to confirm or open a dispute; if you do nothing, the payment is released to the seller.
- Sellers pay a **7% fee** on each completed sale, taken from the payout.
- In a dispute, we review the evidence from both sides (messages, delivery proof) and decide whether to refund the buyer or pay the seller. Our decision on the escrowed funds is final on the platform.
- **Prohibited items** include: counterfeit or replica goods; fake or forged ID, certificates or financial documents; social media, gaming or email accounts; stolen cards, “logs”, hacking tools or anyone's personal data; weapons, drugs and anything illegal in Nigeria. We remove such ads and may close the account.

## 5. Reseller API
If you use our API, keep your API key secret, stay within the request limits, and follow these terms for every order placed through your key. You are responsible for orders and charges made with your key.

## 6. Things you must not do
- Break the law, defraud anyone, or launder money.
- Top up with a card or account that isn't yours.
- Use bots, scrape the site, try to get around our limits or security, or attack the site.
- Harass other users or post misleading ads.

## 7. Suspension and closing
We may suspend or close an account that breaks these terms or is linked to fraud, and hold funds while we investigate or where the law requires. You can close your account at any time by emailing us; we will pay out any balance you are entitled to, minus anything owed.

## 8. Our responsibility
- We work hard to keep the site running, but it may sometimes be unavailable, and services from third-party providers can be delayed or fail.
- As far as the law allows, we are not responsible for indirect losses (such as lost profits or lost followers), and our total responsibility for any claim is limited to the amount you paid us for the order concerned.
- Nothing in these terms removes rights you have under Nigerian consumer protection law.

## 9. Changes
We may update these terms or our prices. Changes apply from the date shown at the top; orders you already placed keep the price you paid.

## 10. Law and complaints
These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Lagos State have jurisdiction. If something goes wrong, email [support@almightypumps.com](mailto:support@almightypumps.com) first and we will try to fix it quickly.`;

export const LEGAL_DEFAULTS: Record<LegalKind, string> = { privacy: PRIVACY, terms: TERMS };
