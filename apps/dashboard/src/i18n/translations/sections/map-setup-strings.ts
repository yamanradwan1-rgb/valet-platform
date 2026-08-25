/**
 * Map Setup surface strings (D3-002): points, polygon areas, vertices,
 * editor sheets, confirmation dialogs and map-setup enum labels.
 */

export interface MapSetupStrings {
  "mapSetup.note": string;
  "mapSetup.viewportNote": string;
  "mapSetup.tab.points": string;
  "mapSetup.tab.areas": string;
  "mapSetup.kpi.points": string;
  "mapSetup.kpi.activePoints": string;
  "mapSetup.kpi.areas": string;
  "mapSetup.kpi.activeAreas": string;
  "mapSetup.list.pointsTitle": string;
  "mapSetup.list.areasTitle": string;
  "mapSetup.empty.all": string;
  "mapSetup.empty.points": string;
  "mapSetup.empty.areas": string;
  "mapSetup.action.addPoint": string;
  "mapSetup.action.addArea": string;
  "mapSetup.action.edit": string;
  "mapSetup.action.replaceVertices": string;
  "mapSetup.action.activate": string;
  "mapSetup.action.deactivate": string;
  "mapSetup.action.cancel": string;
  "mapSetup.detail.pointFields": string;
  "mapSetup.detail.areaFields": string;
  "mapSetup.detail.noneSelected": string;
  "mapSetup.detail.separateOperationsNote": string;
  "mapSetup.confirm.deactivateTitle": string;
  "mapSetup.confirm.deactivateBody": string;
  "mapSetup.confirm.replaceTitle": string;
  "mapSetup.confirm.replaceBody": string;
  "mapSetup.confirm.confirm": string;
  "mapSetup.map.ariaLabel": string;
  "mapSetup.refresh.failed": string;
  "mapSetup.field.id": string;
  "mapSetup.field.code": string;
  "mapSetup.field.label": string;
  "mapSetup.field.kind": string;
  "mapSetup.field.purpose": string;
  "mapSetup.field.latitude": string;
  "mapSetup.field.longitude": string;
  "mapSetup.field.levelLabel": string;
  "mapSetup.field.levelLabelOptional": string;
  "mapSetup.field.parkingZoneId": string;
  "mapSetup.field.parkingZoneHint": string;
  "mapSetup.field.active": string;
  "mapSetup.field.vertices": string;
  "mapSetup.field.createdAt": string;
  "mapSetup.field.updatedAt": string;
  "enum.pointKind.ENTRANCE": string;
  "enum.pointKind.PICKUP": string;
  "enum.pointKind.DROP_OFF": string;
  "enum.areaPurpose.PARKING": string;
  "enum.areaPurpose.OVERFLOW": string;
  "enum.areaPurpose.STAGING": string;
  "enum.areaPurpose.RESTRICTED": string;
  "mapSetup.state.active": string;
  "mapSetup.state.inactive": string;
  "mapSetup.state.verticesCountSuffix": string;
  "mapSetup.editor.pointCreateTitle": string;
  "mapSetup.editor.pointEditTitle": string;
  "mapSetup.editor.pointNote": string;
  "mapSetup.editor.areaCreateTitle": string;
  "mapSetup.editor.areaCreateNote": string;
  "mapSetup.editor.areaFieldsTitle": string;
  "mapSetup.editor.areaFieldsNote": string;
  "mapSetup.editor.verticesTitle": string;
  "mapSetup.editor.verticesNote": string;
  "mapSetup.editor.verticesFormat": string;
  "mapSetup.editor.currentVertexCount": string;
  "mapSetup.editor.save": string;
  "mapSetup.editor.create": string;
  "mapSetup.editor.saving": string;
  "mapSetup.validation.codeRequired": string;
  "mapSetup.validation.codeTooLong": string;
  "mapSetup.validation.labelRequired": string;
  "mapSetup.validation.labelTooLong": string;
  "mapSetup.validation.levelTooLong": string;
  "mapSetup.validation.latitudeInvalid": string;
  "mapSetup.validation.longitudeInvalid": string;
  "mapSetup.validation.verticesFormat": string;
  "mapSetup.validation.verticesMinimum": string;
  "mapSetup.validation.verticesMaximum": string;
  "mapSetup.errors.conflict": string;
  "mapSetup.errors.actionFailed": string;
}

export const mapSetupEn: MapSetupStrings = {
  "mapSetup.note":
    "Configure the operational map points and polygon areas staff rely on. Supported point types are Entrance, Pickup and Drop-off; area purposes are Parking, Overflow, Staging and Restricted. Entries are deactivated rather than deleted.",
  "mapSetup.viewportNote":
    "Development viewport: the map starts at a fixed development center and zoom. It is not stored configuration.",
  "mapSetup.tab.points": "Points",
  "mapSetup.tab.areas": "Areas",
  "mapSetup.kpi.points": "Points",
  "mapSetup.kpi.activePoints": "Active points",
  "mapSetup.kpi.areas": "Areas",
  "mapSetup.kpi.activeAreas": "Active areas",
  "mapSetup.list.pointsTitle": "Configured points",
  "mapSetup.list.areasTitle": "Configured polygon areas",
  "mapSetup.empty.all":
    "No map points or areas are configured for this location yet.",
  "mapSetup.empty.points": "No map points are configured for this location yet.",
  "mapSetup.empty.areas":
    "No polygon areas are configured for this location yet.",
  "mapSetup.action.addPoint": "Add point",
  "mapSetup.action.addArea": "Add area",
  "mapSetup.action.edit": "Edit",
  "mapSetup.action.replaceVertices": "Replace vertices",
  "mapSetup.action.activate": "Activate",
  "mapSetup.action.deactivate": "Deactivate…",
  "mapSetup.action.cancel": "Cancel",
  "mapSetup.detail.pointFields": "Point fields",
  "mapSetup.detail.areaFields": "Area fields",
  "mapSetup.detail.noneSelected": "Select an entry to see its fields.",
  "mapSetup.detail.separateOperationsNote":
    "Area field updates and vertex replacement are separate backend operations and are kept as separate actions here.",
  "mapSetup.confirm.deactivateTitle": "Deactivate this entry?",
  "mapSetup.confirm.deactivateBody":
    "Deactivating removes it from the operational map and setup lists while keeping its record. You can activate it again later.",
  "mapSetup.confirm.replaceTitle": "Replace the vertex list?",
  "mapSetup.confirm.replaceBody":
    "This replaces the entire ordered vertex list of the area in one backend operation. The previous geometry is kept until the backend confirms the replacement.",
  "mapSetup.confirm.confirm": "Confirm",
  "mapSetup.map.ariaLabel":
    "Map preview of configured points and polygon areas",
  "mapSetup.refresh.failed":
    "Refreshing the saved data after your change failed. The shown values may be outdated.",
  "mapSetup.field.id": "ID",
  "mapSetup.field.code": "Code",
  "mapSetup.field.label": "Label",
  "mapSetup.field.kind": "Type",
  "mapSetup.field.purpose": "Purpose",
  "mapSetup.field.latitude": "Latitude",
  "mapSetup.field.longitude": "Longitude",
  "mapSetup.field.levelLabel": "Level label",
  "mapSetup.field.levelLabelOptional": "Level label (optional)",
  "mapSetup.field.parkingZoneId": "Parking zone ID",
  "mapSetup.field.parkingZoneHint":
    "Existing parking-zone references are shown read-only; linking is managed through parking zones.",
  "mapSetup.field.active": "Active",
  "mapSetup.field.vertices": "Ordered vertices",
  "mapSetup.field.createdAt": "Created at",
  "mapSetup.field.updatedAt": "Updated at",
  "enum.pointKind.ENTRANCE": "Entrance",
  "enum.pointKind.PICKUP": "Pickup",
  "enum.pointKind.DROP_OFF": "Drop-off",
  "enum.areaPurpose.PARKING": "Parking",
  "enum.areaPurpose.OVERFLOW": "Overflow",
  "enum.areaPurpose.STAGING": "Staging",
  "enum.areaPurpose.RESTRICTED": "Restricted",
  "mapSetup.state.active": "Active",
  "mapSetup.state.inactive": "Inactive",
  "mapSetup.state.verticesCountSuffix": "vertices",
  "mapSetup.editor.pointCreateTitle": "Add map point",
  "mapSetup.editor.pointEditTitle": "Edit map point",
  "mapSetup.editor.pointNote":
    "Set the code, label, type, exact coordinates, optional level label and active state.",
  "mapSetup.editor.areaCreateTitle": "Add polygon area",
  "mapSetup.editor.areaCreateNote":
    "Create the area with its fields and 3–500 ordered coordinates. Vertex order is saved exactly as listed.",
  "mapSetup.editor.areaFieldsTitle": "Edit area fields",
  "mapSetup.editor.areaFieldsNote":
    "Update the area metadata. Vertices are replaced through their own separate operation.",
  "mapSetup.editor.verticesTitle": "Replace area vertices",
  "mapSetup.editor.verticesNote":
    "Provide the complete ordered vertex list. Order is authoritative; no closing vertex is added for you.",
  "mapSetup.editor.verticesFormat":
    "One latitude,longitude pair per line, in order.",
  "mapSetup.editor.currentVertexCount": "Current vertex count",
  "mapSetup.editor.save": "Save",
  "mapSetup.editor.create": "Create",
  "mapSetup.editor.saving": "Saving…",
  "mapSetup.validation.codeRequired": "A code is required.",
  "mapSetup.validation.codeTooLong": "The code must be at most 64 characters.",
  "mapSetup.validation.labelRequired": "A label is required.",
  "mapSetup.validation.labelTooLong":
    "The label must be at most 160 characters.",
  "mapSetup.validation.levelTooLong":
    "The level label must be at most 64 characters.",
  "mapSetup.validation.latitudeInvalid":
    "Enter a latitude between -90 and 90.",
  "mapSetup.validation.longitudeInvalid":
    "Enter a longitude between -180 and 180.",
  "mapSetup.validation.verticesFormat":
    "Each line needs exactly one latitude,longitude pair with valid values.",
  "mapSetup.validation.verticesMinimum": "At least 3 vertices are required.",
  "mapSetup.validation.verticesMaximum": "No more than 500 vertices are allowed.",
  "mapSetup.errors.conflict":
    "This map setup change conflicts with the current saved state — for example the code may already be in use or another change was saved at the same time. The saved configuration was not changed. Review the latest data and try again.",
  "mapSetup.errors.actionFailed":
    "The change could not be saved. The saved configuration was not altered.",
};

export const mapSetupAr: MapSetupStrings = {
  "mapSetup.note":
    "قم بإعداد نقاط الخريطة التشغيلية ومناطق المضلعات التي يعتمد عليها الموظفون. أنواع النقاط المدعومة هي المدخل والاستلام والتسليم؛ وأغراض المناطق هي ركن، فائض، تجهيز، ومقيَّد. يتم تعطيل الإدخالات بدلًا من حذفها.",
  "mapSetup.viewportNote":
    "إطار عرض للتطوير: تبدأ الخريطة من مركز ومستوى تكبير ثابتين للتطوير، وهو ليس إعدادًا محفوظًا.",
  "mapSetup.tab.points": "النقاط",
  "mapSetup.tab.areas": "المناطق",
  "mapSetup.kpi.points": "النقاط",
  "mapSetup.kpi.activePoints": "النقاط النشطة",
  "mapSetup.kpi.areas": "المناطق",
  "mapSetup.kpi.activeAreas": "المناطق النشطة",
  "mapSetup.list.pointsTitle": "النقاط المُعدّة",
  "mapSetup.list.areasTitle": "مناطق المضلعات المُعدّة",
  "mapSetup.empty.all":
    "لا توجد نقاط أو مناطق مُعدّة للخريطة في هذا الموقع حتى الآن.",
  "mapSetup.empty.points": "لا توجد نقاط خريطة مُعدّة في هذا الموقع حتى الآن.",
  "mapSetup.empty.areas": "لا توجد مناطق مضلعات مُعدّة في هذا الموقع حتى الآن.",
  "mapSetup.action.addPoint": "إضافة نقطة",
  "mapSetup.action.addArea": "إضافة منطقة",
  "mapSetup.action.edit": "تعديل",
  "mapSetup.action.replaceVertices": "استبدال الرؤوس",
  "mapSetup.action.activate": "تفعيل",
  "mapSetup.action.deactivate": "تعطيل…",
  "mapSetup.action.cancel": "إلغاء",
  "mapSetup.detail.pointFields": "حقول النقطة",
  "mapSetup.detail.areaFields": "حقول المنطقة",
  "mapSetup.detail.noneSelected": "حدد عنصرًا لعرض حقوله.",
  "mapSetup.detail.separateOperationsNote":
    "تحديث حقول المنطقة واستبدال الرؤوس عمليتان منفصلتان في الخادم، لذلك تُبقيهما هنا كإجراءين منفصلين.",
  "mapSetup.confirm.deactivateTitle": "تعطيل هذا العنصر؟",
  "mapSetup.confirm.deactivateBody":
    "يؤدي التعطيل إلى إخفائه من الخريطة التشغيلية وقوائم الإعداد مع الاحتفاظ بسجله. يمكنك تفعيله لاحقًا.",
  "mapSetup.confirm.replaceTitle": "استبدال قائمة الرؤوس؟",
  "mapSetup.confirm.replaceBody":
    "سيؤدي هذا إلى استبدال قائمة الرؤوس المرتبة بالكامل للمنطقة في عملية واحدة بالخادم. تبقى الهندسة السابقة محفوظة حتى يؤكد الخادم الاستبدال.",
  "mapSetup.confirm.confirm": "تأكيد",
  "mapSetup.map.ariaLabel": "معاينة الخريطة للنقاط والمناطق المضلعة المُعدّة",
  "mapSetup.refresh.failed":
    "فشل تحديث البيانات المحفوظة بعد تغييرك. قد تكون القيم المعروضة قديمة.",
  "mapSetup.field.id": "المعرّف",
  "mapSetup.field.code": "الرمز",
  "mapSetup.field.label": "العنوان",
  "mapSetup.field.kind": "النوع",
  "mapSetup.field.purpose": "الغرض",
  "mapSetup.field.latitude": "خط العرض",
  "mapSetup.field.longitude": "خط الطول",
  "mapSetup.field.levelLabel": "اسم الطابق",
  "mapSetup.field.levelLabelOptional": "اسم الطابق (اختياري)",
  "mapSetup.field.parkingZoneId": "معرّف منطقة الركن",
  "mapSetup.field.parkingZoneHint":
    "تُعرض مراجع مناطق الركن الحالية للقراءة فقط؛ والربط يتم عبر إدارة مناطق الركن.",
  "mapSetup.field.active": "نشط",
  "mapSetup.field.vertices": "الرؤوس المرتبة",
  "mapSetup.field.createdAt": "أُنشئ في",
  "mapSetup.field.updatedAt": "حُدِّث في",
  "enum.pointKind.ENTRANCE": "مدخل",
  "enum.pointKind.PICKUP": "استلام",
  "enum.pointKind.DROP_OFF": "تسليم",
  "enum.areaPurpose.PARKING": "ركن",
  "enum.areaPurpose.OVERFLOW": "فائض",
  "enum.areaPurpose.STAGING": "تجهيز",
  "enum.areaPurpose.RESTRICTED": "مقيَّد",
  "mapSetup.state.active": "نشط",
  "mapSetup.state.inactive": "غير نشط",
  "mapSetup.state.verticesCountSuffix": "رأسًا",
  "mapSetup.editor.pointCreateTitle": "إضافة نقطة خريطة",
  "mapSetup.editor.pointEditTitle": "تعديل نقطة خريطة",
  "mapSetup.editor.pointNote":
    "حدّد الرمز والعنوان والنوع والإحداثيات الدقيقة واسم الطابق الاختياري وحالة التفعيل.",
  "mapSetup.editor.areaCreateTitle": "إضافة منطقة مضلعة",
  "mapSetup.editor.areaCreateNote":
    "أنشئ المنطقة بحقولها وثلاثة إلى خمسمئة إحداثي مرتب. يُحفظ ترتيب الرؤوس تمامًا كما يُدرج.",
  "mapSetup.editor.areaFieldsTitle": "تعديل حقول المنطقة",
  "mapSetup.editor.areaFieldsNote":
    "حدّث بيانات المنطقة الأساسية. أما الرؤوس فتُستبدل عبر عملية منفصلة خاصة بها.",
  "mapSetup.editor.verticesTitle": "استبدال رؤوس المنطقة",
  "mapSetup.editor.verticesNote":
    "قدّم قائمة الرؤوس المرتبة كاملة. الترتيب هو المرجع، ولا يُضاف أي رأس إغلاق تلقائيًا.",
  "mapSetup.editor.verticesFormat": "زوج خط عرض,خط طول واحد في كل سطر وبالترتيب.",
  "mapSetup.editor.currentVertexCount": "عدد الرؤوس الحالي",
  "mapSetup.editor.save": "حفظ",
  "mapSetup.editor.create": "إنشاء",
  "mapSetup.editor.saving": "جارٍ الحفظ…",
  "mapSetup.validation.codeRequired": "الرمز مطلوب.",
  "mapSetup.validation.codeTooLong": "يجب ألا يتجاوز الرمز 64 حرفًا.",
  "mapSetup.validation.labelRequired": "العنوان مطلوب.",
  "mapSetup.validation.labelTooLong": "يجب ألا يتجاوز العنوان 160 حرفًا.",
  "mapSetup.validation.levelTooLong": "يجب ألا يتجاوز اسم الطابق 64 حرفًا.",
  "mapSetup.validation.latitudeInvalid": "أدخل خط عرض بين -90 و90.",
  "mapSetup.validation.longitudeInvalid": "أدخل خط طول بين -180 و180.",
  "mapSetup.validation.verticesFormat":
    "كل سطر يحتاج زوجًا واحدًا بصيغة خط عرض,خط طول بقيم صحيحة.",
  "mapSetup.validation.verticesMinimum": "يلزم ثلاثة رؤوس على الأقل.",
  "mapSetup.validation.verticesMaximum": "لا يُسمح بأكثر من 500 رأس.",
  "mapSetup.errors.conflict":
    "يتعارض هذا التغيير مع الحالة المحفوظة الحالية لإعداد الخريطة — فقد يكون الرمز مستخدمًا بالفعل أو تم حفظ تغيير آخر في الوقت نفسه. لم يتم تغيير الإعداد المحفوظ. راجع أحدث البيانات وحاول مجددًا.",
  "mapSetup.errors.actionFailed":
    "تعذر حفظ التغيير. لم يُعدَّل الإعداد المحفوظ.",
};
