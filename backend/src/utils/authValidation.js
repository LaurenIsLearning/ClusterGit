const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_ALLOWED_DOMAINS = ["pfw.edu", "students.pfw.edu", "university.edu"];

export function getAllowedSchoolEmailDomains() {
  const raw = String(process.env.ALLOWED_SCHOOL_EMAIL_DOMAINS || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  return raw.length > 0 ? raw : DEFAULT_ALLOWED_DOMAINS;
}

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function isValidEmailFormat(email) {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export function isAllowedSchoolEmail(email) {
  const normalized = normalizeEmail(email);
  const [, domain = ""] = normalized.split("@");
  return getAllowedSchoolEmailDomains().includes(domain);
}

export function validatePasswordAuthEmail(email) {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return "Email is required";
  }

  if (!isValidEmailFormat(normalized)) {
    return "Enter a valid email address";
  }

  if (!isAllowedSchoolEmail(normalized)) {
    return "Use your school email to sign in or sign up";
  }

  return "";
}
