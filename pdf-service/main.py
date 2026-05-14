import base64
import io
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

app = FastAPI(title="PDF Generation Service", version="1.0.0")


class LetterRequest(BaseModel):
    Number: str
    Questions: str
    Answers: str
    Date: str


class LetterResponse(BaseModel):
    pdf_base64: str
    filename: str


def build_pdf(req: LetterRequest) -> bytes:
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=25 * mm,
        rightMargin=25 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()

    header_style = ParagraphStyle(
        "Header",
        parent=styles["Normal"],
        fontSize=16,
        fontName="Helvetica-Bold",
        alignment=TA_CENTER,
        textColor=colors.HexColor("#003366"),
        spaceAfter=2 * mm,
    )

    subheader_style = ParagraphStyle(
        "SubHeader",
        parent=styles["Normal"],
        fontSize=10,
        fontName="Helvetica",
        alignment=TA_CENTER,
        textColor=colors.HexColor("#003366"),
        spaceAfter=1 * mm,
    )

    label_style = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontSize=10,
        fontName="Helvetica-Bold",
        alignment=TA_LEFT,
    )

    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        fontName="Helvetica",
        alignment=TA_JUSTIFY,
        leading=16,
        spaceAfter=4 * mm,
    )

    ref_style = ParagraphStyle(
        "Ref",
        parent=styles["Normal"],
        fontSize=10,
        fontName="Helvetica",
        alignment=TA_LEFT,
        spaceAfter=2 * mm,
    )

    elements = []

    # --- Letterhead ---
    elements.append(Paragraph("FORMAL ACKNOWLEDGEMENT", header_style))
    elements.append(Spacer(1, 3 * mm))
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#003366")))
    elements.append(Spacer(1, 5 * mm))

    # --- Reference & Date block ---
    try:
        parsed_date = datetime.strptime(req.Date, "%d/%m/%Y").strftime("%d %B %Y")
    except ValueError:
        parsed_date = req.Date

    ref_table = Table(
        [
            [Paragraph("<b>Our Ref:</b>", ref_style), Paragraph(req.Number, ref_style)],
            [Paragraph("<b>Date:</b>", ref_style), Paragraph(parsed_date, ref_style)],
        ],
        colWidths=[35 * mm, None],
    )
    ref_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(ref_table)
    elements.append(Spacer(1, 8 * mm))

    # --- Subject line ---
    elements.append(
        Paragraph(
            "<b>ACKNOWLEDGEMENT OF ENQUIRY</b>",
            ParagraphStyle(
                "Subject",
                parent=styles["Normal"],
                fontSize=11,
                fontName="Helvetica-Bold",
                underlineProportion=0.05,
                spaceAfter=6 * mm,
            ),
        )
    )

    # --- Salutation ---
    elements.append(Paragraph(f"Dear {req.Answers},", body_style))

    # --- Opening paragraph ---
    elements.append(
        Paragraph(
            "Thank you for your enquiry. We have received your submission and wish to acknowledge receipt thereof.",
            body_style,
        )
    )

    # --- Questions section ---
    elements.append(Paragraph("<b>Summary of Enquiry Received:</b>", label_style))
    elements.append(Spacer(1, 2 * mm))

    enquiry_box = Table(
        [[Paragraph(req.Questions, body_style)]],
        colWidths=["100%"],
    )
    enquiry_box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#003366")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0f4f8")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    elements.append(enquiry_box)
    elements.append(Spacer(1, 6 * mm))

    # --- Body paragraphs ---
    elements.append(
        Paragraph(
            "We will review your enquiry and endeavour to provide a substantive response within "
            "<b>10 working days</b> from the date of this letter. Should additional time be required "
            "to furnish a complete reply, we will notify you accordingly.",
            body_style,
        )
    )

    elements.append(
        Paragraph(
            "If you have any further questions or wish to provide additional information in the interim, "
            f"please quote reference number <b>{req.Number}</b> in all correspondence.",
            body_style,
        )
    )

    elements.append(
        Paragraph(
            "We thank you for your interest and look forward to assisting you.",
            body_style,
        )
    )

    elements.append(Spacer(1, 10 * mm))

    # --- Sign-off ---
    elements.append(Paragraph("Yours sincerely,", body_style))
    elements.append(Spacer(1, 15 * mm))
    elements.append(Paragraph("<b>_______________________________</b>", body_style))
    elements.append(Paragraph("<b>Authorised Signatory</b>", label_style))

    elements.append(Spacer(1, 8 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    elements.append(Spacer(1, 2 * mm))
    elements.append(
        Paragraph(
            f"<i>This is a system-generated acknowledgement. Reference: {req.Number}</i>",
            ParagraphStyle(
                "Footer",
                parent=styles["Normal"],
                fontSize=8,
                textColor=colors.grey,
                alignment=TA_CENTER,
            ),
        )
    )

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()


@app.post("/generate-pdf", response_model=LetterResponse)
def generate_pdf(req: LetterRequest):
    try:
        pdf_bytes = build_pdf(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}") from exc

    encoded = base64.b64encode(pdf_bytes).decode("utf-8")
    filename = f"Acknowledgement_{req.Number}.pdf"
    return LetterResponse(pdf_base64=encoded, filename=filename)


@app.get("/health")
def health():
    return {"status": "ok"}
