/*
  Good Harbor — small behaviours shared by every page.

  1. Light / dark mode button (the starting theme is set in <head>).
  2. The "Menu" button on phones and tablets.
  3. The contact form (only on /contact).
  4. A hidden door to the site editor: triple-click the footer logo.
*/

/* 1. Theme ---------------------------------------------------------------- */

const root = document.documentElement;

document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* private browsing: the choice just won't be remembered */
  }
});

/* 2. Mobile menu ---------------------------------------------------------- */

const masthead = document.querySelector("[data-masthead]");
const menuToggle = document.querySelector("[data-menu-toggle]");

if (masthead && menuToggle) {
  const setMenu = (open) => {
    masthead.classList.toggle("menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
  };

  menuToggle.addEventListener("click", () => setMenu(!masthead.classList.contains("menu-open")));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });
}

/* 3. Contact form --------------------------------------------------------- */

const form = document.querySelector("[data-contact-form]");

if (form) {
  const status = form.querySelector("[data-form-status]");
  const button = form.querySelector("button[type=submit]");

  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.services = new FormData(form).getAll("services");

    if (!data.name?.trim() || !data.message?.trim()) {
      showStatus("Please add your name and a short message.", true);
      return;
    }
    if (!data.phone?.trim() && !data.email?.trim()) {
      showStatus("Please give us a phone number or an email address so we can reply.", true);
      return;
    }

    button.disabled = true;
    showStatus("Sending…");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      form.reset();
      showStatus("Thank you! Your message is on its way. We'll be in touch within one business day.");
    } catch {
      const phone = document.querySelector("[data-site=phone]")?.textContent || "802-458-5500";
      showStatus(`Sorry, your message didn't send. Please call us at ${phone} instead.`, true);
    } finally {
      button.disabled = false;
    }
  });
}

/* 4. Editor door ---------------------------------------------------------- */

document.querySelector("[data-admin-door]")?.addEventListener("click", (event) => {
  if (event.detail === 3) window.location.href = "/admin";
});
