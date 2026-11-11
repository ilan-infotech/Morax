import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password field with a local, accessible show/hide control. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, disabled, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <span className="password-input">
        <input
          {...props}
          ref={ref}
          className={className}
          disabled={disabled}
          type={visible ? "text" : "password"}
        />
        <button
          type="button"
          className="password-visibility-toggle"
          disabled={disabled}
          onClick={(event) => {
            // Password fields are commonly rendered inside a form label.
            // Prevent that outer label from reclaiming the click after this
            // control has changed the input type.
            event.preventDefault();
            event.stopPropagation();
            setVisible((current) => !current);
          }}
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    );
  },
);
