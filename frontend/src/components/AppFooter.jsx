const CURRENT_YEAR = new Date().getFullYear();

function FooterAction({ children, onClick, className = "" }) {
  return (
    <button type="button" className={`app-footer-link ${className}`} onClick={onClick}>
      <span>{children}</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
        <path d="M4 12 12 4M5 4h7v7" />
      </svg>
    </button>
  );
}

export default function AppFooter({ onNavigate, onManageUsers, canManageUsers }) {
  return (
    <footer className="app-footer" aria-label="Application footer">
      <div className="app-footer-grid">
        <section className="app-footer-brand" aria-labelledby="footer-brand-title">
          <div className="app-footer-brandmarks" aria-label="ACM SVNIT Surat">
            <span className="app-footer-logo app-footer-logo-acm">
              <img src="/branding/acm_logo.png" alt="ACM Student Chapter logo" />
            </span>
            <span className="app-footer-brand-divider" aria-hidden="true">×</span>
            <span className="app-footer-logo app-footer-logo-svnit">
              <img src="/branding/svnit_logo.png" alt="SVNIT logo" />
            </span>
          </div>
          <h2 id="footer-brand-title">Smart Document Generator</h2>
          <p className="app-footer-institution">ACM Student Chapter · SVNIT Surat</p>
          <p className="app-footer-description">
            Simplifying official document creation for ACM SVNIT through a streamlined and efficient document generation workflow.
          </p>
        </section>

        <nav className="app-footer-column" aria-labelledby="footer-workspace-title">
          <h2 id="footer-workspace-title">Workspace</h2>
          <FooterAction onClick={() => onNavigate("create", null, "home")}>Dashboard</FooterAction>
          <FooterAction onClick={() => onNavigate("create", null, "create")}>Document Studio</FooterAction>
          <FooterAction onClick={() => onNavigate("batch")}>Batch Generation</FooterAction>
          <FooterAction onClick={() => onNavigate("history")}>Generated Documents</FooterAction>
          <FooterAction onClick={() => onNavigate("templates")}>Templates</FooterAction>
          {canManageUsers && <FooterAction onClick={onManageUsers}>User Management</FooterAction>}
        </nav>

        <nav className="app-footer-column" aria-labelledby="footer-documents-title">
          <h2 id="footer-documents-title">Documents</h2>
          <FooterAction onClick={() => onNavigate("create", "exec_meet", "create")}>Permission Document</FooterAction>
          <FooterAction onClick={() => onNavigate("create", "prize_money_receipt", "create")}>Prize Money Receipt</FooterAction>
          <FooterAction onClick={() => onNavigate("history")}>Submitted</FooterAction>
          <FooterAction onClick={() => onNavigate("create", "bill_summary", "create")}>Bill Summary</FooterAction>
          <FooterAction onClick={() => onNavigate("create", "bill_certificate", "create")}>Bill Certi</FooterAction>
        </nav>

        <section className="app-footer-column app-footer-information" aria-labelledby="footer-info-title">
          <h2 id="footer-info-title">Institution</h2>
          <p className="app-footer-info-item">
            <span className="app-footer-info-icon" aria-hidden="true">⌖</span>
            <span><strong>ACM Student Chapter</strong><small>SVNIT Surat</small></span>
          </p>
          <p className="app-footer-info-note">Official document workflows for the ACM community at Sardar Vallabhbhai National Institute of Technology.</p>
        </section>
      </div>

      <div className="app-footer-bottom">
        <p>© {CURRENT_YEAR} Smart Document Generator <span aria-hidden="true">·</span> ACM SVNIT <span aria-hidden="true">·</span> SVNIT Surat</p>
        <span className="app-footer-bottom-mark"><span aria-hidden="true" /> Built for the ACM SVNIT community</span>
      </div>
    </footer>
  );
}
