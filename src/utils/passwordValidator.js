/* ════════════════════════════════════════════
   🔐 PASSWORD VALIDATION UTILITY
════════════════════════════════════════════ */

const commonWeakPasswords = [
  "123456", "password", "12345678", "qwerty", "abc123", "monkey", "1234567",
  "letmein", "trustno1", "dragon", "baseball", "iloveyou", "master", "sunshine",
  "ashley", "bailey", "passw0rd", "shadow", "123123", "654321", "superman",
  "qazwsx", "michael", "football", "111111", "000000", "1111111", "admin",
  "login", "welcome", "1234", "12345", "123456789", "password1", "pick2win"
];

export const validatePasswordStrength = (password) => {
  /* ── 1. Check minimum length ── */
  if (!password || password.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters long"
    };
  }

  /* ── 2. Check maximum length ── */
  if (password.length > 128) {
    return {
      valid: false,
      message: "Password must not exceed 128 characters"
    };
  }

  /* ── 3. Check for uppercase letters ── */
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one uppercase letter (A-Z)"
    };
  }

  /* ── 4. Check for lowercase letters ── */
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one lowercase letter (a-z)"
    };
  }

  /* ── 5. Check for numbers ── */
  if (!/\d/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one number (0-9)"
    };
  }

  /* ── 6. Check for special characters ── */
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one special character (!@#$%^&*)"
    };
  }

  /* ── 7. Check for spaces ── */
  if (/\s/.test(password)) {
    return {
      valid: false,
      message: "Password cannot contain spaces"
    };
  }

  /* ── 8. Check against common weak passwords ── */
  if (commonWeakPasswords.includes(password.toLowerCase())) {
    return {
      valid: false,
      message: "This password is too common. Please choose a stronger password"
    };
  }

  /* ── 9. Check for sequential patterns ── */
  if (/(.)\1{3,}/.test(password)) {
    return {
      valid: false,
      message: "Password cannot contain 4 or more repeating characters (e.g., 'aaaa')"
    };
  }

  /* ── 10. Check for keyboard patterns ── */
  const keyboardPatterns = ["qwerty", "asdfgh", "zxcvbn", "123456", "qwertz"];
  for (const pattern of keyboardPatterns) {
    if (password.toLowerCase().includes(pattern)) {
      return {
        valid: false,
        message: "Password contains weak keyboard patterns. Please choose a stronger password"
      };
    }
  }

  return {
    valid: true,
    message: "Password is strong"
  };
};

export default validatePasswordStrength;
