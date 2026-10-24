import { useEffect, useState } from "react";
import { Alert, Button, Modal, Spin, Tag } from "antd";
import {
  CloseOutlined,
  MailOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import type { ReactNode } from "react";
import { API_ENDPOINTS, fetchWithAuth } from "../../utils/api";
import "./CustomerDocumentModal.css";

type BookingPolicy = {
  cancellation_deadline: string;
  refund_before_deadline_percent: number;
  refund_after_deadline_percent: number;
  makeup_allowed: boolean;
  makeup_notice_hours: number;
  class_requirements?: string;
};

type CustomerDocument = {
  reference: string;
  status: string;
  class_title?: string;
  child_name?: string;
  partner_name?: string;
  start_date?: string;
  end_date?: string;
  outlet_name?: string;
  outlet_address?: string;
  package_label?: string;
  classes_total?: number;
  credits_charged?: number;
  issued_at: string;
  amount?: number | string;
  credits_purchased?: number;
  payment_provider?: string;
  payment_reference?: string;
  customer_email: string;
  policy?: BookingPolicy;
};

type CustomerDocumentModalProps = {
  documentType: "booking" | "payment";
  recordId: string | null;
  open: boolean;
  onClose: () => void;
};

const formatDateTime = (value?: string): string => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
};

const formatMoney = (value?: number | string): string =>
  `SGD ${Number(value ?? 0).toFixed(2)}`;

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="customer-document-detail">
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const CustomerDocumentModal = ({ documentType, recordId, open, onClose }: CustomerDocumentModalProps) => {
  const [documentData, setDocumentData] = useState<CustomerDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [error, setError] = useState("");

  const isBooking = documentType === "booking";

  useEffect(() => {
    if (!open || !recordId || !documentType) return undefined;
    let active = true;

    const loadDocument = async () => {
      setLoading(true);
      setError("");
      setDocumentData(null);
      try {
        const endpoint = isBooking
          ? API_ENDPOINTS.GET_BOOKING_CONFIRMATION(recordId)
          : API_ENDPOINTS.GET_PAYMENT_RECEIPT(recordId);
        const response = await fetchWithAuth(endpoint);
        const data = (await response.json()) as { error?: string; document?: CustomerDocument };
        if (!response.ok) {
          throw new Error(data.error || "Unable to load this document");
        }
        if (active) setDocumentData(data.document || null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDocument();
    return () => {
      active = false;
    };
  }, [documentType, isBooking, open, recordId]);

  const emailDocument = async () => {
    if (!recordId) return;
    setEmailing(true);
    try {
      const endpoint = isBooking
        ? API_ENDPOINTS.EMAIL_BOOKING_CONFIRMATION(recordId)
        : API_ENDPOINTS.EMAIL_PAYMENT_RECEIPT(recordId);
      const response = await fetchWithAuth(endpoint, { method: "POST" });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "Unable to send email");
      toast.success(data.message || "Email sent");
    } catch (emailError) {
      toast.error(emailError instanceof Error ? emailError.message : String(emailError));
    } finally {
      setEmailing(false);
    }
  };

  const policy = documentData?.policy;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      centered
      destroyOnHidden
      closable={false}
      className="customer-document-modal"
    >
      <article className="customer-document-print-area">
        <header className="customer-document-header">
          <div>
            <span className="customer-document-brand">Junior Pass</span>
            <p>{isBooking ? "Booking confirmation" : "Payment receipt"}</p>
            <h2>
              {isBooking ? "Your class is confirmed" : "Credit top-up receipt"}
            </h2>
          </div>
          <Button
            type="text"
            icon={<CloseOutlined />}
            aria-label="Close document"
            onClick={onClose}
            className="customer-document-close"
          />
        </header>

        {loading && (
          <div className="customer-document-loading">
            <Spin />
            <span>Loading document…</span>
          </div>
        )}

        {!loading && error && (
          <Alert type="error" showIcon message="Document unavailable" description={error} />
        )}

        {!loading && documentData && (
          <div className="customer-document-body">
            <div className="customer-document-reference">
              <span>{isBooking ? "Booking reference" : "Receipt number"}</span>
              <strong>{documentData.reference}</strong>
              <Tag color={documentData.status === "cancelled" ? "red" : "green"}>
                {documentData.status}
              </Tag>
            </div>

            <dl className="customer-document-details">
              {isBooking ? (
                <>
                  <Detail label="Class">{documentData.class_title}</Detail>
                  <Detail label="Child">{documentData.child_name}</Detail>
                  <Detail label="Partner">{documentData.partner_name}</Detail>
                  <Detail label="Date and time">
                    {formatDateTime(documentData.start_date)} – {formatDateTime(documentData.end_date)}
                  </Detail>
                  <Detail label="Location">
                    {documentData.outlet_name || "Outlet"}, {documentData.outlet_address}
                  </Detail>
                  <Detail label="Package">
                    {documentData.package_label} · {documentData.classes_total} classes
                  </Detail>
                  <Detail label="Credits charged">
                    {documentData.credits_charged} credits
                  </Detail>
                </>
              ) : (
                <>
                  <Detail label="Payment date">{formatDateTime(documentData.issued_at)}</Detail>
                  <Detail label="Amount paid">{formatMoney(documentData.amount)}</Detail>
                  <Detail label="Credits purchased">
                    {documentData.credits_purchased} credits
                  </Detail>
                  <Detail label="Payment method">{documentData.payment_provider}</Detail>
                  <Detail label="Payment reference">
                    <span className="customer-document-breakable">
                      {documentData.payment_reference}
                    </span>
                  </Detail>
                </>
              )}
            </dl>

            {isBooking && policy && (
              <section className="customer-document-policy">
                <h3>Booking policy</h3>
                <p>
                  Cancel by {formatDateTime(policy.cancellation_deadline)} to receive {policy.refund_before_deadline_percent}% of the charged credits back. After the deadline, the refund is {policy.refund_after_deadline_percent}%.
                </p>
                <p>
                  {policy.makeup_allowed
                    ? `Make-up requests are allowed with at least ${policy.makeup_notice_hours} hours’ notice, subject to availability.`
                    : "Make-up requests are not available for this booking."}
                </p>
                <p>{policy.class_requirements || "No additional class requirements were provided."}</p>
              </section>
            )}

            <footer className="customer-document-note">
              Issued {formatDateTime(documentData.issued_at)} to {documentData.customer_email}
            </footer>
          </div>
        )}
      </article>

      {!loading && documentData && (
        <div className="customer-document-actions">
          <Button icon={<MailOutlined />} loading={emailing} onClick={emailDocument}>
            Email me a copy
          </Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
            Print or save PDF
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default CustomerDocumentModal;
