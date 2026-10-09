// Multilingual translations for English, Hindi, and Gujarati
export const translations = {
  en: {
    appTitle: "Smart Document Generator",
    chapterTitle: "ACM Student Chapter",
    instituteTitle: "Sardar Vallabhbhai National Institute of Technology, Surat",
    apiConnected: "Backend Connected",
    apiOffline: "Backend Offline",
    currentRole: "Active Role",
    switchRole: "Switch Role",
    language: "Language",
    create_doc: "Document Studio",
    batch_generator: "Batch Generator",
    version_history: "Versions & Approvals",
    template_editor: "Template Editor",
    analytics: "Analytics Dashboard",
    recommended_type: "AI Recommendation",
    status_approved: "Approved",
    status_in_review: "In Review",
    tabs: {
      generator: "Document Generator",
      batch: "Batch Generator",
      history: "Versions & Approvals",
      templates: "Template Editor",
      analytics: "Analytics Dashboard"
    },
    cards: {
      exec_meet: {
        title: "Executive Meet",
        desc: "Event proposals, official schedules and permission requests for ACM activities."
      },
      bill_certificate: {
        title: "Bill Certificate",
        desc: "Recurring expenditure certification, dynamic line items, supplier & payment details."
      },
      bill_summary: {
        title: "Bill Summary",
        desc: "Reimbursement summary, multiple recipients, prize distributions, and bank details."
      }
    },
    nlp: {
      heading: "Natural Language Quick-Fill Assistant",
      placeholder: "e.g., 'We are organizing an AI Workshop on 28 October 2026 at Seminar Hall 402 with 120 students coordinated by Darshil Prajapati...'",
      analyzeBtn: "Analyze & Quick-Fill",
      analyzing: "Analyzing with AI / NLP...",
      recBadge: "AI Recommendation",
      confidence: "Confidence",
      ambiguousWarn: "Prompt is ambiguous. Please confirm the document type.",
      useClause: "Insert Approved Clause"
    },
    buttons: {
      review: "Review Document",
      generate: "Generate Official Documents",
      generating: "Generating DOCX & PDF...",
      clearForm: "Clear Form",
      loadDemo: "Load Demo Data",
      downloadDocx: "Download DOCX",
      downloadPdf: "Download PDF",
      signDocument: "Digitally Sign Document",
      verifySignature: "Verify Signature Integrity",
      sendEmail: "Distribute via Email",
      exportDrive: "Export to Google Drive",
      restoreVersion: "Restore this Version",
      applyClause: "Insert Selected Clause",
      saveConfig: "Save Template Settings"
    },
    workflow: {
      status: "Workflow Status",
      draft: "Draft",
      ready_for_review: "Ready for Review",
      in_review: "In Review",
      approved: "Approved",
      changes_requested: "Changes Requested",
      rejected: "Rejected",
      transitionAction: "Submit Transition",
      commentPlaceholder: "Enter optional feedback or review notes..."
    },
    fields: {
      eventName: "Event Name",
      eventDate: "Event Date",
      venue: "Venue",
      startTime: "Start Time",
      endTime: "End Time",
      participants: "Expected Participants",
      mode: "Mode of Conduct",
      onlinePlatform: "Online Meeting Platform",
      onlineLink: "Meeting URL / Link",
      agendaToggle: "Include Formal Agenda Section",
      agendaItems: "Agenda Items & Timeline",
      organizers: "Organizing Committee / Club",
      description: "Brief Description",
      objective: "Objective",
      chairperson: "Student Chairperson / Coordinator",
      supplierName: "Supplier / Vendor Name",
      documentDate: "Document Date",
      subtotal: "Subtotal",
      taxes: "Taxes / Extra Charges",
      grandTotal: "Grand Total",
      taxToggle: "Specify Tax Breakdown",
      taxDetails: "Tax Specification (e.g. CGST 9% + SGST 9%)",
      title: "Document Title",
      subtitle: "Activity Subtitle",
      recipients: "Recipients & Reimbursement Table"
    }
  },

  hi: {
    appTitle: "स्मार्ट डॉक्यूमेंट जनरेटर",
    chapterTitle: "एसीएम छात्र शाखा",
    instituteTitle: "सरदार वल्लभभाई राष्ट्रीय प्रौद्योगिकी संस्थान, सूरत",
    apiConnected: "बैकएंड जुड़ा हुआ है",
    apiOffline: "बैकएंड ऑफ़लाइन है",
    currentRole: "सक्रिय भूमिका",
    switchRole: "भूमिका बदलें",
    language: "भाषा",
    create_doc: "दस्तावेज़ स्टूडियो",
    batch_generator: "बैच जनरेटर",
    version_history: "संस्करण और अनुमोदन",
    template_editor: "टेम्पलेट संपादक",
    analytics: "उपयोग विश्लेषण",
    recommended_type: "एआई अनुशंसा",
    status_approved: "स्वीकृत",
    status_in_review: "समीक्षाधीन",
    tabs: {
      generator: "दस्तावेज़ जनरेटर",
      batch: "बैच जनरेटर",
      history: "संस्करण और अनुमोदन",
      templates: "टेम्पलेट संपादक",
      analytics: "उपयोग विश्लेषण",
    },
    cards: {
      exec_meet: {
        title: "कार्यकारी बैठक (Executive Meet)",
        desc: "एसीएम गतिविधियों के लिए कार्यक्रम प्रस्ताव और आधिकारिक अनुमति पत्र।"
      },
      bill_certificate: {
        title: "बिल प्रमाणपत्र (Bill Certificate)",
        desc: "व्यय प्रमाणन, क्रय सामग्री, विक्रेता एवं भुगतान विवरण।"
      },
      bill_summary: {
        title: "बिल सारांश (Bill Summary)",
        desc: "प्रतिपूर्ति सारांश, पुरस्कार वितरण और बैंक विवरण तालिका।"
      }
    },
    nlp: {
      heading: "प्राकृतिक भाषा सहायक (NLP Quick-Fill)",
      placeholder: "उदा., 'हम 28 अक्टूबर 2026 को सेमिनार हॉल 402 में 120 छात्रों के लिए एक एआई कार्यशाला आयोजित कर रहे हैं...'",
      analyzeBtn: "विश्लेषण करें और भरें",
      analyzing: "विश्लेषण किया जा रहा है...",
      recBadge: "एआई अनुशंसा",
      confidence: "विश्वास स्तर",
      ambiguousWarn: "विवरण अस्पष्ट है। कृपया दस्तावेज़ प्रकार की पुष्टि करें।",
      useClause: "स्वीकृत खंड शामिल करें"
    },
    buttons: {
      review: "दस्तावेज़ की समीक्षा करें",
      generate: "दस्तावेज़ तैयार करें",
      generating: "DOCX और PDF बनाए जा रहे हैं...",
      clearForm: "फ़ॉर्म साफ़ करें",
      loadDemo: "डेमो डेटा लोड करें",
      downloadDocx: "DOCX डाउनलोड करें",
      downloadPdf: "PDF डाउनलोड करें",
      signDocument: "डिजिटल हस्ताक्षर करें",
      verifySignature: "हस्ताक्षर की सत्यता जांचें",
      sendEmail: "ईमेल द्वारा भेजें",
      exportDrive: "गूगल ड्राइव पर भेजें",
      restoreVersion: "यह संस्करण पुनर्स्थापित करें",
      applyClause: "चयनित खंड जोड़ें",
      saveConfig: "सेटिंग्स सहेजें"
    },
    workflow: {
      status: "कार्यप्रवाह स्थिति",
      draft: "प्रारूप (Draft)",
      ready_for_review: "समीक्षा के लिए तैयार",
      in_review: "समीक्षा जारी",
      approved: "स्वीकृत (Approved)",
      changes_requested: "परिवर्तन का अनुरोध",
      rejected: "अस्वीकृत",
      transitionAction: "स्थिति बदलें",
      commentPlaceholder: "समीक्षा टिप्पणी दर्ज करें..."
    },
    fields: {
      eventName: "कार्यक्रम का नाम",
      eventDate: "कार्यक्रम की तिथि",
      venue: "स्थान / हॉल",
      startTime: "आरंभ समय",
      endTime: "समाप्ति समय",
      participants: "अनुमानित प्रतिभागी",
      mode: "आयोजन का प्रकार",
      onlinePlatform: "ऑनलाइन मीटिंग प्लेटफॉर्म",
      onlineLink: "मीटिंग लिंक",
      agendaToggle: "औपचारिक कार्यसूची शामिल करें",
      agendaItems: "कार्यसूची बिंदु",
      organizers: "आयोजन समिति / क्लब",
      description: "संक्षिप्त विवरण",
      objective: "उद्देश्य",
      chairperson: "विद्यार्थी अध्यक्ष / समन्वयक",
      supplierName: "विक्रेता / आपूर्तिकर्ता का नाम",
      documentDate: "दस्तावेज़ की तिथि",
      subtotal: "उप-योग (Subtotal)",
      taxes: "कर / अतिरिक्त शुल्क",
      grandTotal: "कुल योग (Grand Total)",
      taxToggle: "कर विवरण निर्दिष्ट करें",
      taxDetails: "कर का विवरण (उदा. CGST 9% + SGST 9%)",
      title: "दस्तावेज़ का शीर्षक",
      subtitle: "गतिविधि उपशीर्षक",
      recipients: "लाभार्थी और प्रतिपूर्ति तालिका"
    }
  },

  gu: {
    appTitle: "સ્માર્ટ દસ્તાવેજ જનરેટર",
    chapterTitle: "ACM વિદ્યાર્થી શાખા",
    instituteTitle: "સરદાર વલ્લભભાઈ નેશનલ ઇન્સ્ટિટ્યૂટ ઓફ ટેકનોલોજી, સુરત",
    apiConnected: "બેકએન્ડ જોડાયેલ છે",
    apiOffline: "બેકએન્ડ ઑફલાઇન છે",
    currentRole: "સક્રિય ભૂમિકા",
    switchRole: "ભૂમિકા બદલો",
    language: "ભાષા",
    create_doc: "દસ્તાવેજ સ્ટુડિયો",
    batch_generator: "બેચ જનરેટર",
    version_history: "આવૃત્તિ અને મંજૂરી",
    template_editor: "ટેમ્પલેટ એડિટર",
    analytics: "વપરાશ વિશ્લેષણ",
    recommended_type: "એઆઈ ભલામણ",
    status_approved: "મંજૂર",
    status_in_review: "સમીક્ષા હેઠળ",
    tabs: {
      generator: "દસ્તાવેજ જનરેટર",
      batch: "બેચ જનરેટર",
      history: "આવૃત્તિ અને મંજૂરી",
      templates: "ટેમ્પલેટ એડિટર",
      analytics: "વપરાશ વિશ્લેષણ",
    },
    cards: {
      exec_meet: {
        title: "એક્ઝિક્યુટિવ મીટ (Executive Meet)",
        desc: "ACM પ્રવૃત્તિઓ માટે કાર્યક્રમ દરખાસ્ત અને સત્તાવાર પરવાનગી પત્ર."
      },
      bill_certificate: {
        title: "બિલ પ્રમાણપત્ર (Bill Certificate)",
        desc: "ખર્ચ પ્રમાણીકરણ, ખરીદી સામગ્રી, વિક્રેતા અને ચુકવણી વિગતો."
      },
      bill_summary: {
        title: "બિલ સારાંશ (Bill Summary)",
        desc: "ખર્ચ ભરપાઈ સારાંશ, પુરસ્કાર વિતરણ અને બેંક વિગતો."
      }
    },
    nlp: {
      heading: "નેચરલ લેંગ્વેજ સહાયક (NLP Quick-Fill)",
      placeholder: "દા.ત., 'અમે 28 ઓક્ટોબર 2026 ના રોજ સેમિનાર હોલ 402 માં AI કાર્યશાળાનું આયોજન કરી રહ્યા છીએ...'",
      analyzeBtn: "વિશ્લેષણ કરો અને ફોર્મ ભરો",
      analyzing: "વિશ્લેષણ થઈ રહ્યું છે...",
      recBadge: "AI ભલામણ",
      confidence: "વિશ્વાસ સ્તર",
      ambiguousWarn: "વિગત અસ્પષ્ટ છે. કૃપા કરીને દસ્તાવેજ પ્રકાર પસંદ કરો.",
      useClause: "મંજૂર કલમ ઉમેરો"
    },
    buttons: {
      review: "દસ્તાવેજ ચકાસો",
      generate: "સત્તાવાર દસ્તાવેજ બનાવો",
      generating: "DOCX અને PDF બની રહ્યા છે...",
      clearForm: "ફોર્મ સાફ કરો",
      loadDemo: "ડેમો ડેટા લોડ કરો",
      downloadDocx: "DOCX ડાઉનલોડ કરો",
      downloadPdf: "PDF ડાઉનલોડ કરો",
      signDocument: "ડિજિટલ સહી કરો",
      verifySignature: "સહી ચકાસણી કરો",
      sendEmail: "ઈમેલ દ્વારા મોકલો",
      exportDrive: "ગુગલ ડ્રાઇવ પર મોકલો",
      restoreVersion: "આ આવૃત્તિ પુનઃસ્થાપિત કરો",
      applyClause: "પસંદ કરેલ કલમ ઉમેરો",
      saveConfig: "સેટિંગ્સ સાચવો"
    },
    workflow: {
      status: "કાર્યપ્રવાહ સ્થિતિ",
      draft: "ડ્રાફ્ટ (Draft)",
      ready_for_review: "સમીક્ષા માટે તૈયાર",
      in_review: "સમીક્ષા હેઠળ",
      approved: "મંજૂર (Approved)",
      changes_requested: "ફેરફારોની વિનંતી",
      rejected: "નકારેલ",
      transitionAction: "સ્થિતિ બદલો",
      commentPlaceholder: "ટિપ્પણી દાખલ કરો..."
    },
    fields: {
      eventName: "કાર્યક્રમનું નામ",
      eventDate: "કાર્યક્રમની તારીખ",
      venue: "સ્થળ / હોલ",
      startTime: "શરૂઆત સમય",
      endTime: "સમાપ્તિ સમય",
      participants: "અપેક્ષિત સહભાગીઓ",
      mode: "આયોજનનો પ્રકાર",
      onlinePlatform: "ઓનલાઇન પ્લેટફોર્મ",
      onlineLink: "મીટિંગ લિંક",
      agendaToggle: "કાર્યસૂચિ ઉમેરો",
      agendaItems: "કાર્યસૂચિ વિગતો",
      organizers: "આયોજક સમિતિ / ક્લબ",
      description: "સંક્ષિપ્ત વર્ણન",
      objective: "ઉદ્દેશ્ય",
      chairperson: "વિદ્યાર્થી પ્રમુખ / સંયોજક",
      supplierName: "વિક્રેતા / સપ્લાયરનું નામ",
      documentDate: "દસ્તાવેજ તારીખ",
      subtotal: "પેટા-કુલ (Subtotal)",
      taxes: "કર / અન્ય ચાર્જ",
      grandTotal: "કુલ રકમ (Grand Total)",
      taxToggle: "કર વિગત સ્પષ્ટ કરો",
      taxDetails: "કર વિગત (દા.ત. CGST 9% + SGST 9%)",
      title: "દસ્તાવેજ શીર્ષક",
      subtitle: "પ્રવૃત્તિ ઉપશીર્ષક",
      recipients: "લાભાર્થી અને ચુકવણી કોષ્ટક"
    }
  }
};
