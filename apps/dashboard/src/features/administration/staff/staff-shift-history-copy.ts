export function staffShiftHistoryCopy(locale: "en" | "ar") {
  return locale === "ar"
    ? {
        subtitle: "عرض سجل الورديات ضمن المواقع المصرح بها.",
        employee: "الموظف",
        allEmployees: "كل الموظفين",
        selectedEmployee: "الموظف المحدد",
        selectedLocation: "الموقع المحدد",
        search: "بحث موظفي سجل الورديات",
        searchAction: "بحث",
        allLocations: "كل المواقع المصرح بها",
        allStatuses: "كل الحالات",
        ended: "منتهية",
        endedAt: "الانتهاء",
        duration: "المدة",
        currentRole: "الدور الحالي",
        from: "من (شامل)",
        to: "إلى (غير شامل)",
        timezone: "المنطقة الزمنية للتصفية",
        invalidRange:
          "اختر تاريخين صالحين؛ يجب أن يكون تاريخ النهاية بعد البداية. قد لا تتوفر حدود منتصف الليل في هذه المنطقة الزمنية.",
        empty: "لا توجد ورديات مطابقة ضمن النطاق المصرح به.",
        refresh: "تحديث",
        details: "تفاصيل وردية",
      }
    : {
        subtitle: "View shift history across authorized locations.",
        employee: "Employee",
        allEmployees: "All employees",
        selectedEmployee: "Selected employee",
        selectedLocation: "Selected location",
        search: "Search shift history employees",
        searchAction: "Search",
        allLocations: "All authorized locations",
        allStatuses: "All statuses",
        ended: "Ended",
        endedAt: "Ended",
        duration: "Duration",
        currentRole: "Current role",
        from: "From (inclusive)",
        to: "To (exclusive)",
        timezone: "Filter timezone",
        invalidRange:
          "Choose valid dates with the end after the start. Midnight boundaries may be unavailable in this timezone.",
        empty: "No matching shifts in the authorized scope.",
        refresh: "Refresh",
        details: "Shift details",
      };
}
