// Arabic (Modern Standard Arabic) text for the issue catalog (lib/issues/catalog.ts).
//
// Keyed by finding type — the same key as ISSUE_CATALOG. Only the human-readable fields are
// translated; fsid, MITRE ids, severity/category enums and mitigation scripts stay in the
// English catalog and are never overridden. `steps` must have the same length and order as the
// English steps (enforced by tests/unit/issue-catalog-i18n.test.ts).
//
// Established Latin technical terms (Kerberoasting, SPN, gMSA, RBCD, AD CS, GPO, SAN, EKU,
// SYSVOL, flag names such as DONT_REQ_PREAUTH) are kept in Latin script inside the Arabic text,
// as Saudi enterprise security teams use them.

export interface IssueTextOverlay {
  name: string
  description: string
  mitigation: { summary: string; steps: string[] }
}

export const ISSUE_CATALOG_AR: Record<string, IssueTextOverlay> = {
  // ── Identity posture ──
  kerberoastable: {
    name: 'حسابات معرّضة لهجوم Kerberoasting',
    description: 'تُتيح حسابات الخدمة التي تمتلك SPN لأي مستخدم في النطاق طلب تذكرة خدمة وكسرها دون اتصال لاستخراج كلمة المرور.',
    mitigation: {
      summary: 'استخدم حسابات الخدمة المُدارة (gMSA/MSA)، أو افرض كلمات مرور عشوائية طويلة مع تشفير AES على الحسابات التي تمتلك SPN.',
      steps: [
        'حدّد حسابات الخدمة المتأثرة والخدمات التي تعتمد عليها.',
        'انقل الحسابات إلى حسابات الخدمة المُدارة للمجموعات (gMSA) حيثما أمكن.',
        'للحسابات المتبقية، عيّن كلمة مرور عشوائية لا تقل عن 25 حرفًا وافرض استخدام تشفير AES فقط.',
        'أزل قيم SPN غير الضرورية.',
      ],
    },
  },
  asrep_roastable: {
    name: 'حسابات معرّضة لهجوم AS-REP Roasting',
    description: 'تُتيح الحسابات التي لا تتطلب المصادقة المسبقة في Kerberos للمهاجم طلب استجابة AS-REP وكسرها دون اتصال.',
    mitigation: {
      summary: 'أعِد تفعيل المصادقة المسبقة في Kerberos على جميع الحسابات المتأثرة.',
      steps: [
        'حدّد الحسابات المفعّل عليها خيار "Do not require Kerberos preauthentication" (عدم طلب المصادقة المسبقة).',
        'ألغِ تحديد الخيار (امسح العلامة DONT_REQ_PREAUTH).',
        'غيّر كلمات مرور هذه الحسابات بعد ذلك.',
      ],
    },
  },
  unconstrained_delegation: {
    name: 'التفويض غير المقيّد (Unconstrained Delegation)',
    description: 'تحتفظ الأجهزة الموثوقة للتفويض غير المقيّد بتذاكر TGT لأي مستخدم يُصادق عليها، مما يُمكّن من انتحال هويته بالكامل.',
    mitigation: {
      summary: 'أزل التفويض غير المقيّد، واستخدم التفويض المقيّد أو التفويض المقيّد القائم على الموارد (RBCD)، واحمِ حسابات المستوى 0 (Tier 0).',
      steps: [
        'حدّد أجهزة الكمبيوتر والمستخدمين — من غير وحدات التحكم بالنطاق — الذين يحملون العلامة TRUSTED_FOR_DELEGATION.',
        'انتقل إلى التفويض المقيّد أو RBCD مع تحديد الأهداف صراحةً.',
        'فعّل خيار "Account is sensitive and cannot be delegated" (الحساب حساس ولا يمكن تفويضه) على الحسابات الحساسة.',
      ],
    },
  },
  constrained_delegation: {
    name: 'التفويض المقيّد / RBCD',
    description: 'يمكن إساءة استخدام التفويض المقيّد (لا سيما مع تحويل البروتوكول) والتفويض المقيّد القائم على الموارد (RBCD) لانتحال هوية المستخدمين أمام الخدمات المستهدفة.',
    mitigation: {
      summary: 'راجع أهداف التفويض، وأزل تحويل البروتوكول حيث لا تدعو الحاجة إليه.',
      steps: [
        'دقّق في أهداف التفويض المحددة في msDS-AllowedToDelegateTo وفي إعدادات RBCD.',
        'أزل تحويل البروتوكول (TRUSTED_TO_AUTH_FOR_DELEGATION) حيثما أمكن.',
        'اقصر التفويض على الحد الأدنى المطلوب من قيم SPN.',
      ],
    },
  },
  reversible_encryption: {
    name: 'تخزين كلمات المرور بتشفير قابل للعكس',
    description: 'يمكن فك تشفير كلمات المرور المخزّنة بتشفير قابل للعكس واستعادتها نصًا صريحًا.',
    mitigation: {
      summary: 'عطّل التشفير القابل للعكس وأعِد تعيين كلمات المرور المتأثرة.',
      steps: [
        'امسح العلامة ENCRYPTED_TEXT_PWD_ALLOWED من الحسابات ومن كائنات GPO.',
        'افرض تغيير كلمة المرور على الحسابات المتأثرة.',
      ],
    },
  },
  password_not_required: {
    name: 'كلمة المرور غير مطلوبة',
    description: 'قد تحمل الحسابات المفعّل عليها العلامة PASSWD_NOTREQD كلمات مرور فارغة أو ضعيفة للغاية.',
    mitigation: {
      summary: 'امسح العلامة وافرض كلمة مرور قوية.',
      steps: ['امسح العلامة PASSWD_NOTREQD.', 'أعِد تعيين كلمة المرور إلى كلمة مرور قوية.'],
    },
  },
  password_never_expires: {
    name: 'كلمة مرور لا تنتهي صلاحيتها',
    description: 'تُطيل كلمات المرور غير منتهية الصلاحية فترة التعرض لاختراق بيانات الاعتماد، خاصةً على الحسابات ذات الامتيازات.',
    mitigation: {
      summary: 'عطّل خيار "كلمة المرور لا تنتهي صلاحيتها" على الحسابات ذات الامتيازات.',
      steps: [
        'حدّد الحسابات ذات الامتيازات التي تحمل العلامة DONT_EXPIRE_PASSWORD.',
        'عطّل العلامة وأخضِع الحسابات لسياسة كلمات المرور أو انقلها إلى gMSA.',
      ],
    },
  },
  stale_privileged_account: {
    name: 'حسابات ذات امتيازات خاملة',
    description: 'تظل الحسابات المحمية بواسطة AdminSDHolder (adminCount=1) الخاملة أو المعطّلة أهدافًا جذابة يصعب مراقبتها.',
    mitigation: {
      summary: 'أزل الامتيازات غير المستخدمة أو أوقف الحساب نهائيًا.',
      steps: [
        'تأكد من انتفاء الحاجة إلى الحساب في دور ذي امتيازات.',
        'أزل الحساب من المجموعات ذات الامتيازات وأعِد تعيين قيمة adminCount.',
        'عطّل الحساب أو احذفه.',
      ],
    },
  },
  tier_breach: {
    name: 'مخالفات نموذج المستويات في AD',
    description: 'تصل هوية إلى مستوى أعلى حساسية من المستوى المُسند إليها، مما يُقوّض نموذج المستويات (Tiering).',
    mitigation: {
      summary: 'افرض الفصل بين المستويات، وأزل الوصول العابر للمستويات.',
      steps: [
        'راجع مسار الوصول العابر للمستويات.',
        'أزل الصلاحية أو العضوية المخالفة.',
        'وفّر حسابًا مناسبًا للمستوى المطلوب إذا كان الوصول مشروعًا.',
      ],
    },
  },
  dormant_access: {
    name: 'حسابات خاملة تحتفظ بصلاحيات وصول',
    description: 'تُوسّع الحسابات غير النشطة التي تحتفظ بصلاحيات الوصول سطحَ الهجوم.',
    mitigation: {
      summary: 'عطّل الحسابات الخاملة وأعِد اعتماد صلاحيات الوصول.',
      steps: ['تحقق من عدم النشاط (أكثر من 90 يومًا).', 'عطّل الحساب وجدوِل إزالته.'],
    },
  },
  orphaned_identity: {
    name: 'هويات غير بشرية بلا مالك',
    description: 'تفتقر الهويات غير البشرية (NHI) التي ليس لها مالك إلى المساءلة وإدارة دورة الحياة.',
    mitigation: {
      summary: 'عيّن مالكين لها أو أوقفها نهائيًا.',
      steps: [
        'حدّد حسابات الخدمة وتسجيلات التطبيقات (App Registrations) التي ليس لها مالك.',
        'عيّن مالكًا مسؤولًا أو أزلها.',
      ],
    },
  },
  missing_mfa: {
    name: 'غياب المصادقة متعددة العوامل',
    description: 'الحسابات التي لا تستخدم المصادقة متعددة العوامل (MFA) عرضة لسرقة بيانات الاعتماد وإعادة استخدامها.',
    mitigation: {
      summary: 'افرض المصادقة متعددة العوامل، مع إعطاء الأولوية للحسابات ذات الامتيازات.',
      steps: ['فعّل المصادقة متعددة العوامل وسياسات الوصول المشروط.', 'ابدأ بالمسؤولين والمستخدمين الخارجيين.'],
    },
  },
  expired_certification: {
    name: 'مراجعات اعتماد الوصول المتأخرة',
    description: 'قد تمنح الصلاحيات التي تجاوزت موعد اعتمادها وصولًا دائمًا غير ضروري.',
    mitigation: {
      summary: 'نفّذ حملة اعتماد الوصول.',
      steps: ['أعِد اعتماد الصلاحيات المتأخرة.', 'ألغِ الصلاحيات التي لم تعد مطلوبة.'],
    },
  },
  password_age: {
    name: 'كلمات مرور قديمة',
    description: 'تزيد كلمات المرور القديمة جدًا من التعرض للكسر دون اتصال ولإعادة الاستخدام.',
    mitigation: {
      summary: 'غيّر كلمات المرور القديمة أو اعتمد حسابات gMSA.',
      steps: ['حدّد كلمات المرور التي يتجاوز عمرها ما تسمح به السياسة.', 'غيّرها، وانقل حسابات الخدمة إلى gMSA.'],
    },
  },
  excessive_privilege: {
    name: 'امتيازات مفرطة',
    description: 'هويات تمتلك امتيازات تفوق ما يتطلبه دورها.',
    mitigation: {
      summary: 'اضبط الصلاحيات وفق مبدأ الحد الأدنى من الامتيازات.',
      steps: ['قارن الصلاحيات بصلاحيات مجموعة الأقران.', 'أزل الامتيازات غير المستخدمة.'],
    },
  },
  sod_conflict: {
    name: 'تعارضات الفصل بين المهام',
    description: 'تركيبات صلاحيات خطرة تخالف سياسة الفصل بين المهام (SoD).',
    mitigation: {
      summary: 'وزّع المهام المتعارضة على هويات مختلفة.',
      steps: ['حدّد أزواج الصلاحيات المتعارضة.', 'أزل إحدى الصلاحيتين أو أضف ضوابط تعويضية.'],
    },
  },

  // ── Certificate (AD CS / ESC) ──
  esc1: {
    name: 'ESC1 — قالب شهادة بإعداد خاطئ (SAN)',
    description: 'يسمح القالب للمستخدمين ذوي الامتيازات المنخفضة بتحديد اسم بديل للموضوع (SAN) عشوائي والحصول على شهادة مصادقة، مما يُمكّنهم من انتحال هوية أي مستخدم.',
    mitigation: {
      summary: 'ألغِ خيار "Supply in the request"، واشترط موافقة المدير، وقيّد صلاحيات التسجيل.',
      steps: [
        'عطّل العلامة ENROLLEE_SUPPLIES_SUBJECT على القالب.',
        'اشترط موافقة المدير أو التوقيعات المعتمدة.',
        'اقصر صلاحية التسجيل (Enroll) على الجهات الضرورية فقط.',
      ],
    },
  },
  esc2: {
    name: 'ESC2 — قالب لأي غرض / بدون EKU',
    description: 'يُصدر القالب شهادات لأي غرض (Any Purpose) أو بدون استخدام مفتاح موسّع (EKU) يمكن استخدامها للمصادقة.',
    mitigation: {
      summary: 'قيّد قيم EKU، وقيّد صلاحيات التسجيل.',
      steps: ['حدّد قيم EKU بعينها (وأزل Any Purpose).', 'أضف اشتراط موافقة المدير وقيّد صلاحية التسجيل (Enroll).'],
    },
  },
  esc3: {
    name: 'ESC3 — قالب وكيل التسجيل',
    description: 'استخدام المفتاح الموسّع لوكيل طلب الشهادات (Certificate Request Agent) متاح للمستخدمين ذوي الامتيازات المنخفضة، مما يتيح لهم التسجيل نيابةً عن الآخرين.',
    mitigation: {
      summary: 'قيّد وكلاء التسجيل، وفعّل القيود على جهة إصدار الشهادات (CA).',
      steps: ['حدّد من يمكنه التسجيل في قالب الوكيل.', 'فعّل قيود وكلاء التسجيل على جهة إصدار الشهادات (CA).'],
    },
  },
  esc4: {
    name: 'ESC4 — قالب شهادة قابل للتعديل',
    description: 'قائمة التحكم بالوصول (ACL) للقالب قابلة للكتابة من جهات ذات امتيازات منخفضة، مما يسمح بإعادة تهيئته ليصبح عرضة لـ ESC1.',
    mitigation: {
      summary: 'شدّد قائمة التحكم بالوصول للقالب.',
      steps: [
        'أزل صلاحيات الكتابة (Write) والملكية (Owner) من الجهات ذات الامتيازات المنخفضة.',
        'اقصر الصلاحيات على مسؤولي البنية التحتية للمفاتيح العامة (PKI).',
      ],
    },
  },
  esc6: {
    name: 'ESC6 — العلامة EDITF_ATTRIBUTESUBJECTALTNAME2',
    description: 'تسمح هذه العلامة على جهة إصدار الشهادات لأي طلب بتضمين اسم بديل (SAN) عشوائي لأغراض المصادقة.',
    mitigation: {
      summary: 'عطّل العلامة وأعِد تشغيل جهة إصدار الشهادات.',
      steps: ['نفّذ الأمر: certutil -setreg policy\\EditFlags -EDITF_ATTRIBUTESUBJECTALTNAME2', 'أعِد تشغيل خدمة CertSvc.'],
    },
  },
  esc8: {
    name: 'ESC8 — التسجيل عبر الويب باستخدام HTTP (ترحيل NTLM)',
    description: 'يُتيح التسجيل عبر الويب باستخدام HTTP تنفيذ هجمات ترحيل NTLM (NTLM Relay) للحصول على شهادات مصادقة.',
    mitigation: {
      summary: 'افرض HTTPS مع الحماية الموسّعة للمصادقة (EPA)، أو عطّل التسجيل عبر الويب.',
      steps: [
        'اشترط HTTPS والحماية الموسّعة للمصادقة (EPA) على نقطة التسجيل.',
        'عطّل NTLM أو التسجيل عبر الويب إن لم يكن مستخدمًا.',
      ],
    },
  },
  esc_agent_restrictions: {
    name: 'قيود وكلاء التسجيل معطّلة على جهة إصدار الشهادات',
    description: 'لا توجد قيود على وكلاء التسجيل، إذ يمكن للوكلاء طلب شهادات لأي قالب أو لأي جهة.',
    mitigation: {
      summary: 'فعّل قيود وكلاء التسجيل على جهة إصدار الشهادات (CA).',
      steps: ['اضبط قيود الوكلاء لتقتصر على قوالب وجهات محددة.'],
    },
  },

  // ── GPO ──
  gpo_dangerous_setting: {
    name: 'إعداد GPO خطِر',
    description: 'يضبط أحد كائنات GPO قيمة معروفة بخطورتها (مثل تفعيل حساب الضيف، أو مستوى LM ضعيف، أو تعطيل توقيع SMB، وغيرها).',
    mitigation: {
      summary: 'صحّح الإعداد إلى قيمة آمنة.',
      steps: ['حرّر كائن GPO واضبط القيمة الآمنة.', 'تحقق من تطبيقها عبر مجموعة السياسات الناتجة (RSoP).'],
    },
  },
  rsop_conflict: {
    name: 'تعارض في مجموعة السياسات الناتجة (RSoP)',
    description: 'تضبط عدة كائنات GPO الإعداد نفسه بقيم مختلفة على وحدة تنظيمية (OU) واحدة، مما ينتج عنه سياسة فعلية غير متوقعة.',
    mitigation: {
      summary: 'عالج الإعدادات المتعارضة، وادمج كائنات GPO.',
      steps: ['حدّد كائنات GPO المتعارضة وترتيب ربطها.', 'وحّدها في قيمة مرجعية واحدة معتمدة.'],
    },
  },
  baseline_drift: {
    name: 'انحراف GPO عن خط الأساس',
    description: 'تنحرف السياسة الفعلية للوحدة التنظيمية (OU) عن خط الأساس الأمني المعتمد.',
    mitigation: {
      summary: 'أعِد مواءمة الوحدة التنظيمية مع خط الأساس.',
      steps: ['قارن الإعدادات الفعلية بخط الأساس.', 'صحّح الإعدادات المنحرفة.'],
    },
  },

  // ── Secrets ──
  gpp_cpassword: {
    name: 'كلمة مرور GPP (cpassword) في SYSVOL',
    description: 'تُشفَّر قيمة cpassword في تفضيلات نهج المجموعة (GPP) بمفتاح نشرته Microsoft علنًا، مما يجعلها فعليًا نصًا صريحًا.',
    mitigation: {
      summary: 'أزل كلمات مرور GPP من SYSVOL وغيّرها.',
      steps: [
        'احذف ملفات GPP XML المتأثرة من SYSVOL.',
        'غيّر جميع بيانات الاعتماد المكشوفة.',
        'استخدم LAPS لإدارة كلمات مرور المسؤول المحلي.',
      ],
    },
  },
  cleartext_password: {
    name: 'كلمة مرور بنص صريح في مجلد مشترك',
    description: 'كلمة مرور مخزّنة نصًا صريحًا في ملف مشترك.',
    mitigation: {
      summary: 'أزل بيانات الاعتماد وغيّرها، وقيّد الوصول إلى المجلد المشترك.',
      steps: ['أزل السر من الملف.', 'غيّر بيانات الاعتماد.', 'قيّد صلاحيات المجلد المشترك، واستخدم خزنة أسرار.'],
    },
  },
  connection_string_secret: {
    name: 'بيانات اعتماد في سلسلة اتصال',
    description: 'تتضمن سلسلة اتصال بيانات اعتماد مضمّنة في ملف مشترك.',
    mitigation: {
      summary: 'انتقل إلى المصادقة المتكاملة أو خزنة أسرار، وغيّر بيانات الاعتماد.',
      steps: [
        'استبدل بيانات الاعتماد المضمّنة بالمصادقة المتكاملة أو بمرجع إلى خزنة أسرار.',
        'غيّر بيانات الاعتماد.',
      ],
    },
  },
  script_credential: {
    name: 'بيانات اعتماد في برنامج نصي لتسجيل الدخول',
    description: 'تُمرَّر بيانات اعتماد عبر سطر الأوامر في برنامج نصي لتسجيل الدخول (Logon Script).',
    mitigation: {
      summary: 'أزل بيانات الاعتماد من البرنامج النصي.',
      steps: ['أزل بيانات الاعتماد.', 'استخدم gMSA أو بيانات الاعتماد المخزّنة في المهام المجدولة بدلًا منها.'],
    },
  },
  private_key: {
    name: 'مفتاح خاص في مجلد مشترك',
    description: 'مادة مفتاح خاص مخزّنة في موقع مشترك.',
    mitigation: {
      summary: 'أزل المفتاح وغيّره، وقيّد الوصول إلى المجلد المشترك.',
      steps: ['أزل ملف المفتاح.', 'أعِد إصدار المفتاح أو غيّره.', 'قيّد الوصول إلى المجلد المشترك.'],
    },
  },
}

/** Arabic text for finding types with no catalog entry (mirrors GENERIC_ISSUE_TEXT). */
export const GENERIC_ISSUE_TEXT_AR = {
  description: 'تم رصد ملاحظة أمنية.',
  summary: 'راجع الكائنات المتأثرة وعالجها.',
} as const

/** Display labels for the attack-impact categories (IssueDef.impact / exposure impact). */
export const IMPACT_LABELS: Record<'en' | 'ar', Record<string, string>> = {
  en: {
    credential_theft: 'Credential Theft',
    privilege_escalation: 'Privilege Escalation',
    lateral_movement: 'Lateral Movement',
    persistence: 'Persistence',
  },
  ar: {
    credential_theft: 'سرقة بيانات الاعتماد',
    privilege_escalation: 'تصعيد الامتيازات',
    lateral_movement: 'الحركة الجانبية',
    persistence: 'الاستمرارية',
  },
}
