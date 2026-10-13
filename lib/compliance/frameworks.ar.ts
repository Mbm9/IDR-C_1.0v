// Arabic (Modern Standard Arabic) text for the compliance framework mappings (./frameworks.ts).
//
// Only human-readable text is translated. Framework keys, short names (NCA ECC, SAMA CSF, PDPL),
// versions, control ids (ECC-2-1-1 …), related violation types and assessment methods stay in the
// English source. Official Arabic names are used where they exist:
//   NCA ECC  → الضوابط الأساسية للأمن السيبراني (الهيئة الوطنية للأمن السيبراني)
//   SAMA CSF → إطار الأمن السيبراني (البنك المركزي السعودي)
//   PDPL     → نظام حماية البيانات الشخصية

export interface FrameworkTextOverlay {
  fullName: string
  description: string
}

export interface ControlTextOverlay {
  name: string
  description: string
}

/** Keyed by framework key. */
export const FRAMEWORKS_AR: Record<string, FrameworkTextOverlay> = {
  NCA_ECC: {
    fullName: 'الهيئة الوطنية للأمن السيبراني - الضوابط الأساسية للأمن السيبراني',
    description: 'ضوابط إلزامية للأمن السيبراني للجهات الحكومية وجهات البنية التحتية الوطنية الحساسة في المملكة العربية السعودية.',
  },
  SAMA_CSF: {
    fullName: 'البنك المركزي السعودي - إطار الأمن السيبراني',
    description: 'إطار الأمن السيبراني للمؤسسات المالية الخاضعة لإشراف البنك المركزي السعودي.',
  },
  PDPL: {
    fullName: 'نظام حماية البيانات الشخصية',
    description: 'النظام السعودي لحماية البيانات الشخصية الذي يحكم معالجة البيانات الشخصية.',
  },
}

/** Keyed by control id (ids are unique across frameworks). */
export const CONTROLS_AR: Record<string, ControlTextOverlay> = {
  // ── NCA ECC ──
  'ECC-2-1-1': {
    name: 'إدارة الهويات',
    description: 'إنشاء إدارة الهويات للمستخدمين والأجهزة والأنظمة والمحافظة عليها.',
  },
  'ECC-2-1-2': {
    name: 'التحكم في الوصول',
    description: 'تطبيق التحكم في الوصول وفق مبدأي الحد الأدنى من الصلاحيات والفصل بين المهام.',
  },
  'ECC-2-1-3': {
    name: 'إدارة الصلاحيات الهامة والحساسة',
    description: 'إدارة الوصول ذي الصلاحيات الهامة والحساسة إلى الأنظمة الحرجة ومراقبته.',
  },
  'ECC-2-1-4': {
    name: 'التحقق من الهوية',
    description: 'تطبيق التحقق من الهوية متعدد العناصر (MFA) للوصول ذي الصلاحيات الهامة والوصول عن بُعد.',
  },
  'ECC-2-2-1': {
    name: 'تسجيل الأحداث',
    description: 'تفعيل سجلات الأحداث للأنظمة الحرجة وحمايتها.',
  },
  'ECC-2-2-2': {
    name: 'مراقبة الأمن السيبراني',
    description: 'تطبيق المراقبة المستمرة للأمن السيبراني.',
  },
  'ECC-2-3-1': {
    name: 'إدارة الثغرات',
    description: 'اكتشاف الثغرات ومعالجتها في الوقت المناسب.',
  },
  'ECC-2-4-1': {
    name: 'إدارة حوادث الأمن السيبراني',
    description: 'اكتشاف حوادث الأمن السيبراني والاستجابة لها والتعافي منها.',
  },
  'ECC-2-5-1': {
    name: 'إدارة الأصول',
    description: 'الاحتفاظ بقائمة جرد محدّثة لأصول الجهة.',
  },
  'ECC-2-6-1': {
    name: 'الأمن السيبراني المتعلق بالأطراف الخارجية',
    description: 'إدارة مخاطر الأمن السيبراني الناتجة عن مقدّمي الخدمات من الأطراف الخارجية.',
  },

  // ── SAMA CSF ──
  'SAMA-3-1-1': {
    name: 'سياسة وحوكمة إدارة الهويات والوصول',
    description: 'تحديد سياسات إدارة الهويات والوصول وفرض تطبيقها.',
  },
  'SAMA-3-1-2': {
    name: 'منح وصول المستخدمين وإلغاؤه',
    description: 'إدارة منح صلاحيات وصول المستخدمين وإلغائها.',
  },
  'SAMA-3-1-3': {
    name: 'الوصول ذو الصلاحيات الهامة',
    description: 'التحكم في الوصول ذي الصلاحيات الهامة إلى الأنظمة المالية ومراقبته.',
  },
  'SAMA-3-1-4': {
    name: 'ضوابط التحقق من الهوية',
    description: 'تطبيق آليات قوية للتحقق من الهوية على جميع الأنظمة.',
  },
  'SAMA-3-1-5': {
    name: 'مراجعات الوصول',
    description: 'إجراء مراجعات واعتمادات دورية لصلاحيات الوصول.',
  },
  'SAMA-3-2-1': {
    name: 'تسجيل الأحداث الأمنية',
    description: 'تسجيل الأحداث الأمنية للأنظمة المالية والاحتفاظ بها.',
  },
  'SAMA-3-2-2': {
    name: 'اكتشاف التهديدات',
    description: 'تطبيق قدرات اكتشاف التهديدات والاستجابة لها.',
  },
  'SAMA-3-3-1': {
    name: 'تقييم المخاطر',
    description: 'إجراء تقييمات دورية لمخاطر الأمن السيبراني.',
  },

  // ── PDPL ──
  'PDPL-5': {
    name: 'سجل أنشطة معالجة البيانات',
    description: 'الاحتفاظ بسجل لأنشطة معالجة البيانات الشخصية.',
  },
  'PDPL-10': {
    name: 'التحكم في الوصول إلى البيانات الشخصية',
    description: 'تطبيق ضوابط الوصول لحماية البيانات الشخصية.',
  },
  'PDPL-14': {
    name: 'الحد الأدنى من البيانات',
    description: 'قصر الوصول إلى البيانات الشخصية على القدر الضروري.',
  },
  'PDPL-19': {
    name: 'الإشعار بتسرب البيانات',
    description: 'اكتشاف حالات تسرب البيانات الشخصية والإبلاغ عنها.',
  },
  'PDPL-22': {
    name: 'التدقيق والمساءلة',
    description: 'الاحتفاظ بسجلات تدقيق للوصول إلى البيانات الشخصية.',
  },
  'PDPL-25': {
    name: 'مشاركة البيانات مع الأطراف الخارجية',
    description: 'التحكم في مشاركة البيانات الشخصية مع الأطراف الخارجية ومراقبتها.',
  },
}

/** Control categories (the page groups controls by this text). Keyed by the English value. */
export const CATEGORIES_AR: Record<string, string> = {
  'Identity & Access Management': 'إدارة الهويات والوصول',
  'Security Monitoring': 'المراقبة الأمنية',
  'Risk Management': 'إدارة المخاطر',
  'Incident Response': 'الاستجابة للحوادث',
  'Asset Management': 'إدارة الأصول',
  'Third-Party Risk': 'مخاطر الأطراف الخارجية',
  'Security Operations': 'العمليات الأمنية',
  'Data Governance': 'حوكمة البيانات',
  'Access Control': 'التحكم في الوصول',
  'Audit': 'التدقيق',
}

/** Identity Radar feature names listed in `coveredBy`. Keyed by the English value. */
export const FEATURES_AR: Record<string, string> = {
  'Identity Explorer': 'مستكشف الهويات',
  'Identity Explorer (MFA status)': 'مستكشف الهويات (حالة MFA)',
  'Identity Explorer (MFA)': 'مستكشف الهويات (MFA)',
  'NHI Inventory': 'جرد الهويات غير البشرية',
  'Identity Graph': 'رسم الهوية',
  'Entitlement Radar': 'رادار الصلاحيات',
  'AD Tiering': 'تصنيف AD',
  'Certifications': 'اعتمادات الوصول',
  'Shadow Admin Detection': 'كشف المشرفين الخفيين',
  'Attack Paths': 'مسارات الهجوم',
  'Account Browser': 'مستعرض الحسابات',
  'Audit Trail': 'سجل التدقيق',
  'Action Log': 'سجل الإجراءات',
  'Event Ingest': 'استقبال الأحداث',
  'Threat Detection': 'اكتشاف التهديدات',
  'Cron Jobs': 'المهام المجدولة',
  'Integration Health': 'صحة التكاملات',
  'Risk Scorer': 'محرك تقييم المخاطر',
  'AI Analysis': 'التحليل بالذكاء الاصطناعي',
  'Remediation Plans': 'خطط المعالجة',
  'Canary Identities': 'هويات الكناري',
  'Blast Radius': 'نطاق الانفجار',
  'Resource Browser': 'مستعرض الموارد',
  'Supply Chain Risk': 'مخاطر سلسلة التوريد',
  'Policies': 'السياسات',
  'RBAC Enforcement': 'فرض التحكم في الوصول القائم على الأدوار (RBAC)',
  'RBAC': 'التحكم في الوصول القائم على الأدوار (RBAC)',
  'Lifecycle Automation': 'أتمتة دورة الحياة',
  'Tier 0 Inventory': 'جرد المستوى 0',
  'Peer Anomaly': 'شذوذ الأقران',
  'Data Quality Dashboard': 'لوحة جودة البيانات',
  'Webhooks': 'خطافات الويب (Webhooks)',
}
