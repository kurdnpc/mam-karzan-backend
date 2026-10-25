// Seeds the owner account, store settings, the category tree and sample items.
// Safe to re-run: existing rows are left alone (everything is upserted or skipped).
import "dotenv/config";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const OWNER_PHONE = process.env.SEED_OWNER_PHONE || "07501234567";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD || "mamkarzan123";

const CATEGORIES: { name: string; slug: string; icon: string; image?: string; isVisible?: boolean; subs: [string, string][] }[] = [
  {
    name: "مۆبایل",
    slug: "mobile",
    icon: "smartphone",
    image: "cat-mobile.jpg",
    subs: [["ئایفۆن", "iphone"], ["سامسۆنگ", "samsung"], ["گووگڵ", "google"], ["شیاومی", "xiaomi"]],
  },
  { name: "سیمکارت", slug: "sim", icon: "sim", subs: [["VIP SIM", "vip"], ["Normal SIM", "normal"]] },
  {
    name: "ئێکسسوارات",
    slug: "accessories",
    icon: "headphones",
    image: "cat-accessories.jpg",
    subs: [["هێدفۆن", "headphones"], ["سپیکەر", "speakers"], ["شارژەر", "chargers"], ["کەیس", "cases"], ["کێبڵ", "cables"]],
  },
  { name: "ساعەتی زیرەک", slug: "smart-watches", icon: "watch", image: "cat-watch.jpg", subs: [["ئەپڵ", "apple"], ["سامسۆنگ واچ", "samsung"]] },
  {
    name: "تابلێت",
    slug: "tablets",
    icon: "layers",
    image: "cat-tablet.jpg",
    isVisible: false,
    subs: [["ئایپاد", "ipad"], ["تابلێتی سامسۆنگ", "samsung"]],
  },
  { name: "دیاری", slug: "gifts", icon: "gift", image: "cat-gift.jpg", subs: [["دیاری", "gifts"]] },
];

function copySeedImage(file: string) {
  const uploads = path.resolve(process.cwd(), "uploads");
  mkdirSync(uploads, { recursive: true });
  const target = path.join(uploads, `seed-${file}`);
  if (!existsSync(target)) copyFileSync(path.resolve(import.meta.dirname, "seed-images", file), target);
  return `/uploads/seed-${file}`;
}

async function main() {
  await prisma.user.upsert({
    where: { phone: OWNER_PHONE },
    update: {},
    create: {
      name: "کارزان ئەحمەد",
      phone: OWNER_PHONE,
      role: "OWNER",
      status: "ACTIVE",
      passwordHash: await bcrypt.hash(OWNER_PASSWORD, 10),
    },
  });

  await prisma.storeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      address: "هەولێر، شەقامی 60 مەتری",
      addressNote: "نزیک بازاڕی مۆبایل",
      secondaryPhone: "7709876543",
      instagram: "@mam.karzan",
      facebook: "facebook.com/mamkarzan",
      telegram: "@mamkarzan",
      tiktok: "@mamkarzan",
      aboutText: "فرۆشگای مام کارزان، باشترین مۆبایل، ژمارەی تایبەت و ئێکسسوارات بە نرخی گونجاو. داواکاری ڕاستەوخۆ لە ڕێگەی واتسئاپەوە.",
      promoTitle: "داشکاندنی تا 30% لەسەر کاتژمێرە زیرەکەکان",
      promoSubtitle: "بۆ کڕینی ساعەت یان ئێکسسوارات پەیوەندیمان پێوە بکە، گەیاندن بۆ هەموو کوردستان.",
    },
  });

  // Category tree
  const sub: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const main =
      (await prisma.category.findFirst({ where: { name: c.name, parentId: null } })) ??
      (await prisma.category.create({
        data: {
          name: c.name,
          icon: c.icon,
          image: c.image ? copySeedImage(c.image) : null,
          slug: c.slug,
          sortOrder: i,
          isVisible: c.isVisible ?? true,
        },
      }));
    for (const [j, [s, subSlug]] of c.subs.entries()) {
      const child =
        (await prisma.category.findFirst({ where: { name: s, parentId: main.id } })) ??
        (await prisma.category.create({
          data: { name: s, icon: c.icon, slug: subSlug, parentId: main.id, sortOrder: j },
        }));
      sub[s] = child.id;
    }
  }

  if ((await prisma.item.count()) === 0) {
    const products = [
      {
        name: "ئایفۆن 15 پرۆ ماکس 256 گێگا",
        categoryId: sub["ئایفۆن"],
        priceType: "IQD" as const,
        price: 1450000,
        discountType: "PERCENT" as const,
        discountValue: 14,
        image: "iphone-15-pro-max.jpg",
        description:
          "ئایفۆن 15 پرۆ ماکس بە ڕەنگی تیتانیۆمی سروشتی، بیرگەی 256 گێگابایت. مۆبایلەکە نوێیە و لە پاکەتی خۆیدایە.",
        features: ["گەرەنتی یەک ساڵ", "پاتری 100%، نوێ و لە پاکەتدا", "گەیاندن لە ماوەی 24 کاتژمێر لە هەولێر"],
      },
      {
        name: "سامسۆنگ گالاکسی S23",
        categoryId: sub["سامسۆنگ"],
        priceType: "USD" as const,
        price: 620,
        image: "samsung-s23.jpg",
        description: "سامسۆنگ گالاکسی S23، ڕەنگی ڕەش، بیرگەی 256 گێگا.",
        features: ["گەرەنتی یەک ساڵ"],
      },
      {
        name: "ساعەتی ئەپڵ سیریز 9",
        categoryId: sub["ئەپڵ"],
        priceType: "IQD" as const,
        price: 560000,
        discountType: "PERCENT" as const,
        discountValue: 25,
        image: "apple-watch-9.jpg",
        features: ["قەبارەی 45mm", "گەرەنتی یەک ساڵ"],
      },
      {
        name: "سپیکەری JBL Flip 6",
        categoryId: sub["سپیکەر"],
        priceType: "NONE" as const,
        image: "jbl-flip-6.jpg",
        description: "سپیکەری بێتەلی JBL Flip 6، دژە ئاو.",
        features: [],
      },
    ];
    for (const p of products) {
      const { image, features, ...data } = p;
      await prisma.item.create({
        data: {
          ...data,
          images: { create: [{ url: copySeedImage(image), sortOrder: 0 }] },
          features: { create: features.map((text, i) => ({ text, sortOrder: i })) },
        },
      });
    }

    const numbers = [
      { phoneNumber: "07507777777", operator: "KOREK", pattern: "حەوتی دووبارە", priceType: "IQD", price: 3500000 },
      { phoneNumber: "07801000000", operator: "ZAIN", pattern: "سفری دووبارە", priceType: "NONE", name: "ژمارەی زێڕینی زەین" },
      { phoneNumber: "07704444444", operator: "ASIACELL", pattern: "چواری دووبارە", priceType: "USD", price: 1900 },
      { phoneNumber: "07701990199", operator: "ASIACELL", pattern: "موالید", priceType: "IQD", price: 1200000 },
      { phoneNumber: "07822222222", operator: "ZAIN", pattern: "دووی دووبارە", priceType: "IQD", price: 1900000 },
    ] as const;
    for (const n of numbers) {
      await prisma.item.create({
        data: {
          ...n,
          type: "NUMBER",
          isVip: true,
          categoryId: sub["VIP SIM"],
          description: "ژمارەیەکی دەگمەن و ئاسان بۆ لەبەرکردن. تۆمارکراو و ئامادەی گواستنەوەیە بۆ ناوی کڕیار.",
          features: {
            create: ["تۆمارکراو بە ناوی کڕیار", "گواستنەوە لە ماوەی 24 کاتژمێردا", "ئامادەیە بۆ هەموو مۆبایلێک"].map(
              (text, i) => ({ text, sortOrder: i }),
            ),
          },
        },
      });
    }
    await prisma.item.create({
      data: {
        type: "NUMBER",
        phoneNumber: "07701234455",
        operator: "ASIACELL",
        priceType: "IQD",
        price: 75000,
        categoryId: sub["Normal SIM"],
      },
    });
  }

  if ((await prisma.brand.count()) === 0) {
    await prisma.brand.createMany({
      data: ["Apple", "Samsung", "Google", "Xiaomi", "JBL", "Anker"].map((name, i) => ({ name, sortOrder: i })),
    });
  }

  if ((await prisma.testimonial.count()) === 0) {
    await prisma.testimonial.createMany({
      data: [
        { name: "سارا عەلی", subtitle: "سلێمانی، ژمارەی VIP", text: "ژمارەیەکی VIP م کڕی، هەموو شتێک لە واتسئاپ تەواو بوو. خێرا و ڕاستگۆ، زۆر سوپاس!", sortOrder: 0 },
        { name: "ئاراس محەمەد", subtitle: "هەولێر، سامسۆنگ S23", text: "باشترین نرخ لە هەولێر، وەڵامدانەوەی خێرا و ڕێزدار. دووەم جارمە لێیان دەکڕم.", sortOrder: 1 },
        { name: "هێمن کەریم", subtitle: "دهۆک، ئایفۆن 15", text: "گەیاندن بۆ دهۆک تەنها 2 ڕۆژی خایاند، مۆبایلەکە نوێ و ئەسڵی بوو. پێشنیاری دەکەم.", sortOrder: 2 },
      ],
    });
  }

  if ((await prisma.faq.count()) === 0) {
    await prisma.faq.createMany({
      data: [
        { question: "چۆن داوای کاڵا بکەم؟", answer: "کاڵاکەت هەڵبژێرە و دوگمەی داواکردن لە واتسئاپ دابگرە. نامەیەک بە ناو و نرخی کاڵاکە ئامادە دەبێت، تەنها بینێرە و تیمە وەڵامت دەداتەوە.", sortOrder: 0 },
        { question: "ئایا گەیاندن بۆ شارەکانی تر هەیە؟", answer: "بەڵێ، گەیاندن بۆ هەموو شارەکانی کوردستان هەیە.", sortOrder: 1 },
        { question: "پارەدان چۆنە؟", answer: "پارەدان لە کاتی وەرگرتنی کاڵاکە یان لە فرۆشگا دەکرێت.", sortOrder: 2 },
        { question: "ئایا کاڵاکان گەرەنتییان هەیە؟", answer: "زۆربەی مۆبایل و ساعەتەکان گەرەنتی یەک ساڵیان هەیە.", sortOrder: 3 },
      ],
    });
  }

  console.log(`Seed complete. Owner login: ${OWNER_PHONE} / ${OWNER_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
