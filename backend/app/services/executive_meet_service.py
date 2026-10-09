import os
from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, KeepTogether
)

from app.core.config import settings
from app.schemas.executive_meet import ExecutiveMeetRequest
from app.utils.file_manager import sanitize_filename

def set_cell_background(cell, fill_hex):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

class ExecutiveMeetService:
    @staticmethod
    def generate_docx(data: ExecutiveMeetRequest, output_path: Path):
        doc = Document()
        
        # Set standard margins (0.6 inch)
        for section in doc.sections:
            section.top_margin = Inches(0.6)
            section.bottom_margin = Inches(0.6)
            section.left_margin = Inches(0.65)
            section.right_margin = Inches(0.65)
            section.different_first_page_header_footer = False

        # Header table for Logos and Title
        header_table = doc.add_table(rows=1, cols=3)
        header_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        header_table.autofit = False
        
        # Column widths: Logo 1.0", Text 5.0", Logo 1.0"
        widths = [Inches(0.9), Inches(5.2), Inches(0.9)]
        for row in header_table.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = w

        # SVNIT Logo left
        svnit_logo = settings.ASSETS_DIR / "svnit_logo.png"
        if svnit_logo.exists():
            p_logo_left = header_table.rows[0].cells[0].paragraphs[0]
            p_logo_left.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_logo_left.add_run().add_picture(str(svnit_logo), width=Inches(0.85))

        # Title Center
        cell_mid = header_table.rows[0].cells[1]
        p_mid1 = cell_mid.paragraphs[0]
        p_mid1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_mid1.paragraph_format.space_after = Pt(2)
        r1 = p_mid1.add_run("ASSOCIATION for COMPUTING MACHINERY\n")
        r1.bold = True
        r1.font.size = Pt(13)
        r1.font.color.rgb = RGBColor(15, 23, 42)

        p_mid2 = cell_mid.add_paragraph()
        p_mid2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_mid2.paragraph_format.space_after = Pt(0)
        r2 = p_mid2.add_run("SARDAR VALLABHBHAI NATIONAL INSTITUTE OF TECHNOLOGY, SURAT")
        r2.bold = True
        r2.font.size = Pt(9.5)
        r2.font.color.rgb = RGBColor(71, 85, 105)

        # ACM Logo right
        acm_logo = settings.ASSETS_DIR / "acm_logo.png"
        if acm_logo.exists():
            p_logo_right = header_table.rows[0].cells[2].paragraphs[0]
            p_logo_right.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_logo_right.add_run().add_picture(str(acm_logo), width=Inches(0.85))

        doc.add_paragraph().paragraph_format.space_after = Pt(4)

        # Divider line
        p_div = doc.add_paragraph()
        p_div.paragraph_format.space_after = Pt(8)
        r_div = p_div.add_run("―" * 65)
        r_div.font.size = Pt(8)
        r_div.font.color.rgb = RGBColor(203, 213, 225)
        p_div.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Ref No & Date Row
        meta_table = doc.add_table(rows=1, cols=2)
        meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        meta_table.autofit = False
        meta_table.rows[0].cells[0].width = Inches(4.5)
        meta_table.rows[0].cells[1].width = Inches(2.5)

        p_ref = meta_table.rows[0].cells[0].paragraphs[0]
        r_ref = p_ref.add_run(f"REF NO.: {data.ref_no}")
        r_ref.bold = True
        r_ref.font.size = Pt(10)

        p_date = meta_table.rows[0].cells[1].paragraphs[0]
        p_date.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_date = p_date.add_run(f"DATE: {data.date}")
        r_date.bold = True
        r_date.font.size = Pt(10)

        # Submitted To & Subject
        p_sub = doc.add_paragraph()
        p_sub.paragraph_format.space_before = Pt(8)
        p_sub.paragraph_format.space_after = Pt(4)
        r_sub_to = p_sub.add_run(f"SUBMITTED TO: {data.submitted_to}\n")
        r_sub_to.bold = True
        r_sub_to.font.size = Pt(10)
        
        r_subj = p_sub.add_run(f"SUBJECT: {data.subject}")
        r_subj.bold = True
        r_subj.font.size = Pt(10)

        # Section Header
        p_sec = doc.add_paragraph()
        p_sec.paragraph_format.space_before = Pt(8)
        p_sec.paragraph_format.space_after = Pt(4)
        r_sec = p_sec.add_run("SCHEDULE OF EVENT:\nABOUT THE EVENT")
        r_sec.bold = True
        r_sec.font.size = Pt(10.5)

        # Main Table: About the event
        table = doc.add_table(rows=5, cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        
        col_w = [Inches(1.8), Inches(5.2)]
        for row in table.rows:
            row.cells[0].width = col_w[0]
            row.cells[1].width = col_w[1]

        # Combine description with venue and schedule request as in official document
        full_desc = f"{data.brief_description}\n\nWe request permission to use {data.venue} on {data.event_date} from {data.time_from} to {data.time_to} for conducting the meet."

        table_data = [
            ("Brief Description", full_desc),
            ("Objective", data.objective),
            ("Number of Participants", str(data.participants)),
            ("Mode", data.mode),
            ("Event Organizers", data.organizers),
        ]

        for i, (label, content) in enumerate(table_data):
            c_label = table.rows[i].cells[0]
            c_content = table.rows[i].cells[1]
            
            set_cell_background(c_label, "F8FAFC")
            set_cell_margins(c_label, top=120, bottom=120, left=140, right=140)
            set_cell_margins(c_content, top=120, bottom=120, left=140, right=140)
            
            p_lbl = c_label.paragraphs[0]
            p_lbl.paragraph_format.space_after = Pt(0)
            r_l = p_lbl.add_run(label)
            r_l.bold = True
            r_l.font.size = Pt(9.5)

            p_cnt = c_content.paragraphs[0]
            p_cnt.paragraph_format.space_after = Pt(0)
            r_c = p_cnt.add_run(content)
            r_c.font.size = Pt(9.5)

        # Add border style to event table
        tblPr = table._tbl.tblPr
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>\n'
            f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>\n'
            f'  <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>\n'
            f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>\n'
            f'  <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>\n'
            f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>\n'
            f'  <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>\n'
            f'</w:tblBorders>'
        )
        tblPr.append(borders)

        # Spacer before signatories
        doc.add_paragraph().paragraph_format.space_before = Pt(14)

        # 4-block Signatures grid (2 rows x 2 cols)
        sig_table = doc.add_table(rows=2, cols=2)
        sig_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        sig_table.autofit = False
        sig_w = [Inches(3.5), Inches(3.5)]
        for row in sig_table.rows:
            row.cells[0].width = sig_w[0]
            row.cells[1].width = sig_w[1]

        def format_signatory(cell, name, designation, branch, extra_lbl="", extra_val="", mobile=""):
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            r_n = p.add_run(f"Name: {name}\n")
            r_n.bold = True
            r_n.font.size = Pt(9.5)

            p.add_run(f"Designation: {designation}\n").font.size = Pt(9)
            if extra_lbl and extra_val:
                p.add_run(f"{extra_lbl}: {extra_val}\n").font.size = Pt(9)
            p.add_run(f"Branch: {branch}\n").font.size = Pt(9)
            if mobile:
                p.add_run(f"Mobile No.: {mobile}\n").font.size = Pt(9)
            
            p_sig = cell.add_paragraph()
            p_sig.paragraph_format.space_before = Pt(18)
            p_sig.paragraph_format.space_after = Pt(0)
            r_sig = p_sig.add_run("Signature: ___________________")
            r_sig.font.size = Pt(8.5)
            r_sig.font.color.rgb = RGBColor(148, 163, 184)
            set_cell_margins(cell, top=140, bottom=140, left=100, right=100)

        # Cell (0,0): Chairperson
        format_signatory(
            sig_table.rows[0].cells[0],
            name=data.lead_name,
            designation=data.lead_designation,
            branch=data.lead_branch,
            extra_lbl="Admission No.",
            extra_val=data.lead_admission_no,
            mobile=data.lead_mobile
        )

        # Cell (0,1): Tech Assistant
        format_signatory(
            sig_table.rows[0].cells[1],
            name=data.tech_assist_name,
            designation=data.tech_assist_designation,
            branch=data.tech_assist_branch,
            mobile=data.tech_assist_mobile
        )

        # Cell (1,0): Faculty in-charge
        format_signatory(
            sig_table.rows[1].cells[0],
            name=data.faculty_incharge_name,
            designation=data.faculty_incharge_designation,
            branch=data.faculty_incharge_branch
        )

        # Cell (1,1): Chairman ACM
        format_signatory(
            sig_table.rows[1].cells[1],
            name=data.faculty_chairman_name,
            designation=data.faculty_chairman_designation,
            branch=data.faculty_chairman_branch
        )

        doc.save(str(output_path))
        return output_path

    @staticmethod
    def generate_pdf(data: ExecutiveMeetRequest, output_path: Path):
        doc = SimpleDocTemplate(
            str(output_path),
            pagesize=A4,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        
        styles = getSampleStyleSheet()
        normal = styles["Normal"]
        
        title_style = ParagraphStyle(
            "TitleStyle",
            parent=normal,
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            alignment=1,
            textColor=colors.HexColor("#0f172a")
        )
        subtitle_style = ParagraphStyle(
            "SubTitleStyle",
            parent=normal,
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            alignment=1,
            textColor=colors.HexColor("#334155")
        )
        body_style = ParagraphStyle(
            "BodyStyle",
            parent=normal,
            fontName="Helvetica",
            fontSize=9,
            leading=12.5,
            textColor=colors.HexColor("#1e293b")
        )
        bold_style = ParagraphStyle(
            "BoldStyle",
            parent=normal,
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12.5,
            textColor=colors.HexColor("#0f172a")
        )
        right_bold = ParagraphStyle(
            "RightBold",
            parent=bold_style,
            alignment=2
        )

        story = []

        # Logos and Title header
        svnit_logo = settings.ASSETS_DIR / "svnit_logo.png"
        acm_logo = settings.ASSETS_DIR / "acm_logo.png"

        logo_left = RLImage(str(svnit_logo), width=0.75*inch, height=0.72*inch) if svnit_logo.exists() else ""
        logo_right = RLImage(str(acm_logo), width=0.75*inch, height=0.75*inch) if acm_logo.exists() else ""

        title_p = [
            Paragraph("ASSOCIATION for COMPUTING MACHINERY", title_style),
            Spacer(1, 3),
            Paragraph("SARDAR VALLABHBHAI NATIONAL INSTITUTE OF TECHNOLOGY, SURAT", subtitle_style),
        ]

        header_data = [[logo_left, title_p, logo_right]]
        header_table = Table(header_data, colWidths=[0.85*inch, 5.7*inch, 0.85*inch])
        header_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 8))

        # Thin divider
        div_data = [[""]]
        div_table = Table(div_data, colWidths=[7.4*inch], rowHeights=[1])
        div_table.setStyle(TableStyle([
            ('LINEABOVE', (0,0), (-1,-1), 1, colors.HexColor("#cbd5e1")),
        ]))
        story.append(div_table)
        story.append(Spacer(1, 6))

        # Ref No and Date Table
        ref_data = [[
            Paragraph(f"<b>REF NO.:</b> {data.ref_no}", bold_style),
            Paragraph(f"<b>DATE:</b> {data.date}", right_bold)
        ]]
        ref_table = Table(ref_data, colWidths=[4.7*inch, 2.7*inch])
        ref_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(ref_table)
        story.append(Spacer(1, 6))

        # Submitted To & Subject
        story.append(Paragraph(f"<b>SUBMITTED TO:</b> {data.submitted_to}", bold_style))
        story.append(Spacer(1, 3))
        story.append(Paragraph(f"<b>SUBJECT:</b> {data.subject}", bold_style))
        story.append(Spacer(1, 6))

        # Section Heading
        story.append(Paragraph("<b>SCHEDULE OF EVENT:</b><br/><b>ABOUT THE EVENT</b>", bold_style))
        story.append(Spacer(1, 4))

        # Event details table
        full_desc = f"{data.brief_description}<br/><br/>We request permission to use {data.venue} on {data.event_date} from {data.time_from} to {data.time_to} for conducting the meet."

        table_rows = [
            [Paragraph("<b>Brief Description</b>", bold_style), Paragraph(full_desc, body_style)],
            [Paragraph("<b>Objective</b>", bold_style), Paragraph(data.objective, body_style)],
            [Paragraph("<b>Number of Participants</b>", bold_style), Paragraph(str(data.participants), body_style)],
            [Paragraph("<b>Mode</b>", bold_style), Paragraph(data.mode, body_style)],
            [Paragraph("<b>Event Organizers</b>", bold_style), Paragraph(data.organizers, body_style)],
        ]

        event_table = Table(table_rows, colWidths=[1.8*inch, 5.6*inch])
        event_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (0,-1), colors.HexColor("#f8fafc")),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#94a3b8")),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(event_table)
        story.append(Spacer(1, 14))

        # 4-block Signatures grid
        def make_sig_card(name, desig, branch, extra_label="", extra_val="", mobile=""):
            lines = [
                f"<b>Name:</b> {name}",
                f"<b>Designation:</b> {desig}",
            ]
            if extra_label and extra_val:
                lines.append(f"<b>{extra_label}:</b> {extra_val}")
            lines.append(f"<b>Branch:</b> {branch}")
            if mobile:
                lines.append(f"<b>Mobile No.:</b> {mobile}")
            lines.append("<br/><font color='#94a3b8'>Signature: ____________________</font>")
            return Paragraph("<br/>".join(lines), body_style)

        card1 = make_sig_card(data.lead_name, data.lead_designation, data.lead_branch, "Admission No.", data.lead_admission_no, data.lead_mobile)
        card2 = make_sig_card(data.tech_assist_name, data.tech_assist_designation, data.tech_assist_branch, mobile=data.tech_assist_mobile)
        card3 = make_sig_card(data.faculty_incharge_name, data.faculty_incharge_designation, data.faculty_incharge_branch)
        card4 = make_sig_card(data.faculty_chairman_name, data.faculty_chairman_designation, data.faculty_chairman_branch)

        sig_rows = [
            [card1, card2],
            [card3, card4]
        ]
        sig_table = Table(sig_rows, colWidths=[3.7*inch, 3.7*inch])
        sig_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(KeepTogether(sig_table))

        doc.build(story)
        return output_path
