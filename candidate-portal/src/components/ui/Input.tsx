interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export function Input({ label, error, helper, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helper && !error ? `${inputId}-helper` : undefined;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {props.required && <span className="ml-1 text-primary-700">*</span>}
        </label>
      )}
      <input
        id={inputId}
        aria-describedby={errorId ?? helperId}
        aria-invalid={error ? 'true' : undefined}
        className={[
          'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900',
          'placeholder:text-gray-400 transition-colors',
          'focus:outline-none focus:ring-2',
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
            : 'border-gray-200 focus:border-primary-700 focus:ring-primary-700/20',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
      {error && <p id={errorId} className="mt-1.5 text-xs text-red-600">{error}</p>}
      {helper && !error && <p id={helperId} className="mt-1.5 text-xs text-gray-500">{helper}</p>}
    </div>
  );
}
