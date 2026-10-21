/* Shared design-only controls. Every option uses the same state and calculation contract. */
(function () {
  "use strict";
  function mount(root, render) {
    if (!root || typeof render !== "function" || !window.VAYLET313) throw new Error("Feedback prototype cannot initialize");
    let values = { role: "company", location: "all", period: "sep", state: "live" };
    const toolbar = document.createElement("div");
    toolbar.className = "feedback-demo-tools";
    toolbar.setAttribute("data-testid", "feedback-demo-controls");
    root.insertBefore(toolbar, root.firstChild);
    const controls = [
      ["role", [["company", "company"], ["manager", "manager"]]],
      ["location", [["all", "all"], ["main", "main"], ["north", "north"]]],
      ["period", [["sep", "sep"], ["oct", "oct"], ["aug", "aug"]]],
      ["state", [["live", "live"], ["empty", "empty"], ["none", "none"], ["loading", "busy"], ["error", "fail"], ["denied", "forbidden"]]],
    ];
    const locale = () => document.documentElement.lang.toLowerCase().startsWith("ar") ? "ar" : "en";
    const isDark = () => document.documentElement.dataset.theme === "dark" || document.body.dataset.theme === "dark";
    function paint() {
      const language = locale();
      const tr = window.VAYLET313.localeText[language];
      toolbar.replaceChildren();
      for (const [name, options] of controls) {
        const wrapper = document.createElement("label");
        wrapper.className = "feedback-demo-field";
        const label = document.createElement("span");
        label.textContent = tr[name === "role" || name === "location" ? "scope" : name];
        if (name === "location") label.textContent = tr.location;
        if (name === "role") label.textContent = tr.scope;
        const select = document.createElement("select");
        select.dataset.feedbackControl = name;
        select.setAttribute("aria-label", label.textContent);
        for (const [value, labelKey] of options) {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = tr[labelKey];
          opt.selected = values[name] === value;
          select.append(opt);
        }
        select.disabled = name === "location" && values.role === "manager";
        select.addEventListener("change", () => {
          values[name] = select.value;
          if (name === "role" && values.role === "manager") values.location = "main";
          paint();
        });
        wrapper.append(label, select);
        toolbar.append(wrapper);
      }
      const note = document.createElement("p");
      note.className = "feedback-demo-note";
      note.textContent = tr.simulation;
      toolbar.append(note);
      const data = window.VAYLET313.selectData(values);
      root.dataset.feedbackState = data.status;
      root.dataset.feedbackRole = data.role;
      root.dataset.feedbackPeriod = data.period;
      root.dataset.feedbackLocation = data.location;
      root.dataset.feedbackTheme = isDark() ? "dark" : "light";
      render(data, tr, language);
    }
    const observation = new MutationObserver(() => paint());
    observation.observe(document.documentElement, { attributes: true, attributeFilter: ["lang", "dir", "data-theme"] });
    observation.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("vaylet313-presentation-change", paint);
    paint();
    return { refresh: paint, setValues(next) { values = { ...values, ...next }; if (values.role === "manager") values.location = "main"; paint(); },
      destroy() { observation.disconnect(); document.removeEventListener("vaylet313-presentation-change", paint); toolbar.remove(); } };
  }
  window.VAYLET313_RUNTIME = Object.freeze({ mount });
})();
