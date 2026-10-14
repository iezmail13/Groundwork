// The maintenance page's only script (D87): shows the expected end time in the
// visitor's time zone and checks every minute whether maintenance is over.
(function () {
  var ends = document.getElementById("ends");
  if (ends) {
    try {
      ends.textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "long" })
        .format(new Date(ends.getAttribute("datetime")));
    } catch {}
  }
  var status = document.getElementById("status");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) status.textContent = "Use Check now to see if we're back.";
  function check() {
    fetch("/maintenance/status", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (s) {
      if (s && s.active === false) {
        // back to where they were; from /maintenance itself, the home page
        if (location.pathname === "/maintenance") location.replace(location.origin); else location.reload();
      } else if (reduce) {
        status.textContent = "Still in maintenance. Try again in a minute.";
      }
    }).catch(function () {});
  }
  document.getElementById("again").addEventListener("click", check);
  var timer = null;
  function schedule() {
    clearInterval(timer);
    if (!reduce && !document.hidden) timer = setInterval(check, 60000);
  }
  document.addEventListener("visibilitychange", schedule);
  schedule();
})();
