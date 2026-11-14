"""
Downloadable A4 PDFs of a prescription, an invoice and a lab report.

They follow the same layout as the print pages in the React app, so a document
looks the same whether it was printed from the browser or downloaded. Built with
reportlab's standard fonts, which have no taka sign or prescription symbol, so
amounts read "Tk" and the prescription mark reads "Rx", as on most printed slips.
"""

from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import HospitalProfile

TEAL = colors.HexColor('#0f766e')
INK = colors.HexColor('#0f172a')
MUTED = colors.HexColor('#64748b')
LINE = colors.HexColor('#e2e8f0')
PANEL = colors.HexColor('#f8fafc')
ROSE = colors.HexColor('#be123c')
GREEN = colors.HexColor('#047857')

PAGE_WIDTH = A4[0] - 32 * mm  # inside the margins


def _style(name, **options):
    base = {'fontName': 'Helvetica', 'fontSize': 9.5, 'leading': 13, 'textColor': INK}
    base.update(options)
    return ParagraphStyle(name, **base)


BODY = _style('body')
SMALL = _style('small', fontSize=8, leading=10.5, textColor=MUTED)
LABEL = _style('label', fontName='Helvetica-Bold', fontSize=7.5, leading=10, textColor=MUTED)
STRONG = _style('strong', fontName='Helvetica-Bold')
NAME = _style('name', fontName='Helvetica-Bold', fontSize=12, leading=15)
HOSPITAL = _style('hospital', fontName='Helvetica-Bold', fontSize=16, leading=19, textColor=TEAL)
TITLE = _style('title', fontName='Helvetica-Bold', fontSize=13, leading=16, alignment=TA_RIGHT,
               textColor=colors.HexColor('#334155'))
META = _style('meta', fontSize=8.5, leading=11, alignment=TA_RIGHT, textColor=MUTED)
RX = _style('rx', fontName='Times-BoldItalic', fontSize=26, leading=30, textColor=TEAL)
RIGHT = _style('right', alignment=TA_RIGHT)
CENTER_SMALL = _style('center_small', fontSize=8, leading=10, alignment=TA_CENTER, textColor=MUTED)


def text(value):
    return escape(str(value if value is not None else '')).replace('\n', '<br/>')


def money(value):
    return f'Tk {Decimal(value or 0):,.2f}'


def when(value, with_time=True):
    if not value:
        return ''
    if hasattr(value, 'hour'):
        value = timezone.localtime(value)
        return value.strftime('%d %b %Y, %I:%M %p') if with_time else value.strftime('%d %b %Y')
    return value.strftime('%d %b %Y')


def field(label, value):
    if value in (None, ''):
        return None
    return Paragraph(f'<font color="#64748b">{text(label)}:</font> <b>{text(value)}</b>', BODY)


def age_sex(patient):
    parts = [f'{patient.age} y' if patient.age is not None else '', patient.get_gender_display()]
    return ' / '.join(part for part in parts if part)


def _letterhead(title, meta, hospital):
    left = [Paragraph(text(hospital.get('name')), HOSPITAL)]
    if hospital.get('address'):
        left.append(Paragraph(text(hospital['address']), SMALL))
    contact = ' · '.join(part for part in (hospital.get('phone'), hospital.get('email')) if part)
    if contact:
        left.append(Paragraph(text(contact), SMALL))
    right = [Paragraph(text(title.upper()), TITLE)] + [Paragraph(text(line), META) for line in meta if line]

    table = Table([[left, right]], colWidths=[PAGE_WIDTH * 0.62, PAGE_WIDTH * 0.38])
    table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, 0), 1.6, TEAL),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 9),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    return table


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(MUTED)
    printed = timezone.localtime().strftime('%d %b %Y, %I:%M %p')
    canvas.drawString(16 * mm, 9 * mm, f'{doc.hospital_name} · generated {printed}')
    canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, f'Page {doc.page}')
    canvas.restoreState()


def _build(title, meta, body, document_title):
    buffer = BytesIO()
    hospital = HospitalProfile.details()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm,
        bottomMargin=18 * mm, title=document_title, author=hospital['name'])
    doc.hospital_name = hospital['name']
    doc.build([_letterhead(title, meta, hospital), Spacer(1, 6 * mm), *body], onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


def _panel(left, right, shaded=True):
    table = Table([[[x for x in left if x], [x for x in right if x]]], colWidths=[PAGE_WIDTH / 2] * 2)
    style = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT' if not shaded else 'LEFT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8 if shaded else 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8 if shaded else 0),
        ('TOPPADDING', (0, 0), (-1, -1), 7 if shaded else 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7 if shaded else 0),
    ]
    if shaded:
        style.append(('BACKGROUND', (0, 0), (-1, -1), PANEL))
    table.setStyle(TableStyle(style))
    return table


def _signature(lines):
    block = Table([[[Paragraph(f'<b>{text(lines[0])}</b>', _style('sig', alignment=TA_CENTER))]
                    + [Paragraph(text(line), CENTER_SMALL) for line in lines[1:] if line]]],
                  colWidths=[62 * mm], hAlign='RIGHT')
    block.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, 0), 0.8, MUTED), ('TOPPADDING', (0, 0), (-1, -1), 4)]))
    return KeepTogether([Spacer(1, 22 * mm), block])


# ---------------------------------------------------------------- prescription

def prescription_pdf(prescription):
    appointment = prescription.appointment
    doctor, patient = appointment.doctor, appointment.patient
    medicines = list(prescription.items.select_related('medicine'))
    tests = [order for order in appointment.test_orders.select_related('test') if order.status != 'cancelled']

    doctor_block = [
        Paragraph(text(doctor), NAME),
        Paragraph(text(doctor.designation), STRONG) if doctor.designation else None,
        Paragraph(text(doctor.qualification), BODY) if doctor.qualification else None,
        Paragraph(text(' · '.join(x for x in (doctor.specialization, getattr(doctor.department, 'name', ''))
                                  if x)), _style('spec', textColor=MUTED)),
        Paragraph(f'Reg. no. {text(doctor.license_number)}', SMALL) if doctor.license_number else None,
    ]
    patient_block = [
        field('Patient', patient), field('Age / Sex', age_sex(patient)),
        field('MRN', patient.medical_record_number), field('Blood group', patient.blood_group),
        field('Visit', when(appointment.appointment_date)),
    ]
    body = [_panel(doctor_block, patient_block)]

    if patient.allergies:
        allergy = Table([[Paragraph(f'<b>Allergies:</b> {text(patient.allergies)}',
                                    _style('allergy', textColor=ROSE))]], colWidths=[PAGE_WIDTH])
        allergy.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.8, ROSE),
                                     ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fff1f2'))]))
        body += [Spacer(1, 3 * mm), allergy]

    side = [Paragraph('DIAGNOSIS', LABEL), Paragraph(text(prescription.diagnosis), BODY)]
    if tests:
        side += [Spacer(1, 4 * mm), Paragraph('INVESTIGATIONS', LABEL)]
        side += [Paragraph(f'• {text(order.test.name)}'
                           + (f' <font color="#64748b">— {text(order.instructions)}</font>' if order.instructions else ''),
                           BODY) for order in tests]
    if prescription.notes:
        side += [Spacer(1, 4 * mm), Paragraph('ADVICE', LABEL), Paragraph(text(prescription.notes), BODY)]
    if prescription.follow_up_date:
        side += [Spacer(1, 4 * mm), Paragraph('FOLLOW-UP', LABEL),
                 Paragraph(f'<b>{when(prescription.follow_up_date)}</b>', _style('follow', textColor=TEAL))]

    main = [Paragraph('Rx', RX)]
    if not medicines:
        main.append(Paragraph('No medicines prescribed.', _style('none', textColor=MUTED)))
    for number, item in enumerate(medicines, start=1):
        medicine = item.medicine
        generic = f' <font color="#64748b">({text(medicine.generic_name)})</font>' if medicine.generic_name else ''
        how = ' — '.join(x for x in (item.dosage, item.frequency, f'for {item.duration}' if item.duration else '') if x)
        extra = ' · '.join(x for x in (item.instructions, f'Qty {item.quantity} {medicine.unit}') if x)
        # Plain paragraphs: KeepTogether cannot sit inside a table cell that may split.
        main += [
            Paragraph(f'<b>{number}. {text(medicine.name)}</b>{generic}', _style('med', spaceBefore=5)),
            Paragraph(text(how), _style('how', leftIndent=12)),
            Paragraph(text(extra), _style('extra', leftIndent=12, fontSize=8, leading=10.5, textColor=MUTED)),
        ]

    columns = Table([[side, main]], colWidths=[PAGE_WIDTH * 0.34, PAGE_WIDTH * 0.66], splitInRow=1)
    columns.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEAFTER', (0, 0), (0, -1), 0.6, LINE),
        ('LEFTPADDING', (0, 0), (0, -1), 0),
        ('RIGHTPADDING', (0, 0), (0, -1), 10),
        ('LEFTPADDING', (1, 0), (1, -1), 14),
    ]))
    body += [Spacer(1, 6 * mm), columns,
             _signature([str(doctor), doctor.designation, doctor.qualification, 'Signature'])]

    return _build('Prescription', [f'Rx no. {prescription.pk:06d}', when(prescription.created_at, False)], body,
                  f'Prescription {prescription.pk:06d} — {patient}')


# ---------------------------------------------------------------- invoice

TYPE_LABELS = {'consultation': 'Consultation', 'procedure': 'Procedure', 'medicine': 'Medicine',
               'lab': 'Lab test', 'room': 'Room'}
METHOD_LABELS = {'cash': 'Cash', 'card': 'Card', 'insurance': 'Insurance', 'transfer': 'Transfer'}


def bill_pdf(bill):
    patient, appointment = bill.patient, bill.appointment
    status = 'PAID' if bill.paid else ('PART PAID' if bill.amount_paid > 0 else 'UNPAID')

    billed_to = [
        Paragraph('BILLED TO', LABEL), Paragraph(text(patient), NAME),
        field('MRN', patient.medical_record_number), field('Age / Sex', age_sex(patient)),
        field('Phone', patient.phone), field('Address', patient.address),
    ]
    visit = []
    if appointment:
        visit += [Paragraph('VISIT', _style('vl', fontName='Helvetica-Bold', fontSize=7.5, textColor=MUTED,
                                               alignment=TA_RIGHT)),
                  Paragraph(f'<b>{text(appointment.doctor)}</b>', RIGHT),
                  Paragraph(text(when(appointment.appointment_date)), _style('vd', alignment=TA_RIGHT,
                                                                           textColor=MUTED))]
    visit.append(Spacer(1, 4 * mm))
    stamp = Table([[Paragraph(f'<b>{status}</b>', _style(
        'stamp', fontSize=13, leading=16, alignment=TA_CENTER, textColor=GREEN if bill.paid else ROSE))]],
        colWidths=[34 * mm], hAlign='RIGHT')
    stamp.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 1.6, GREEN if bill.paid else ROSE)]))
    visit.append(stamp)
    body = [_panel(billed_to, visit, shaded=False), Spacer(1, 6 * mm)]

    rows = [['#', 'Description', 'Type', 'Qty', 'Unit price', 'Amount']]
    items = list(bill.items.all())
    for number, item in enumerate(items, start=1):
        rows.append([str(number), Paragraph(text(item.description), BODY),
                     TYPE_LABELS.get(item.service_type, item.service_type), str(item.quantity),
                     money(item.unit_price), money(item.line_total)])
    if not items:
        rows.append(['1', Paragraph('Medical services', BODY), '', '1', money(bill.amount), money(bill.amount)])

    widths = [8 * mm, PAGE_WIDTH - 8 * mm - 26 * mm - 12 * mm - 28 * mm - 30 * mm, 26 * mm, 12 * mm, 28 * mm,
              30 * mm]
    lines = Table(rows, colWidths=widths, repeatRows=1)
    lines.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TEAL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, LINE),
        ('TEXTCOLOR', (0, 1), (0, -1), MUTED),
        ('FONTNAME', (-1, 1), (-1, -1), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    body.append(lines)

    totals = [['Subtotal', money(bill.amount)]]
    if bill.tax:
        totals.append(['VAT / tax', money(bill.tax)])
    if bill.discount:
        totals.append(['Discount', f'- {money(bill.discount)}'])
    totals += [['Total', money(bill.total)], ['Paid', money(bill.amount_paid)], ['Balance due', money(bill.balance)]]
    summary = Table(totals, colWidths=[34 * mm, 34 * mm], hAlign='RIGHT')
    total_row = len(totals) - 3
    summary.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('TEXTCOLOR', (0, 0), (0, -1), MUTED),
        ('FONTNAME', (0, total_row), (-1, total_row), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, total_row), (-1, total_row), INK),
        ('LINEABOVE', (0, total_row), (-1, total_row), 0.8, MUTED),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (1, -1), (1, -1), ROSE if bill.balance > 0 else GREEN),
        ('LINEABOVE', (0, -1), (-1, -1), 0.8, MUTED),
    ]))
    body += [Spacer(1, 4 * mm), KeepTogether(summary)]

    payments = list(bill.payments.all())
    if payments:
        paid_rows = [[when(p.received_at), METHOD_LABELS.get(p.method, p.method), p.reference or '—', money(p.amount)]
                     for p in payments]
        paid = Table(paid_rows, colWidths=[48 * mm, 30 * mm, PAGE_WIDTH - 48 * mm - 30 * mm - 32 * mm, 32 * mm])
        paid.setStyle(TableStyle([('FONTSIZE', (0, 0), (-1, -1), 9), ('ALIGN', (-1, 0), (-1, -1), 'RIGHT'),
                                  ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE)]))
        body += [Spacer(1, 6 * mm), KeepTogether([Paragraph('PAYMENTS RECEIVED', LABEL), Spacer(1, 1.5 * mm), paid])]

    body += [Spacer(1, 4 * mm),
             Paragraph('Thank you for choosing us. Please keep this invoice for your records.', SMALL),
             _signature(['Authorised signature'])]

    meta = [bill.invoice_number, f'Issued {when(bill.created_at, False)}',
            f'Due {when(bill.due_date)}' if bill.due_date and not bill.paid else '']
    return _build('Invoice', meta, body, f'Invoice {bill.invoice_number} — {patient}')


# ---------------------------------------------------------------- lab report

def lab_report_pdf(order):
    appointment = order.appointment
    patient, doctor = appointment.patient, appointment.doctor
    body = [_panel(
        [field('Patient', patient), field('Age / Sex', age_sex(patient)), field('MRN', patient.medical_record_number)],
        [field('Referred by', doctor), field('Ordered', when(order.ordered_at)),
         field('Reported', when(order.completed_at))],
    ), Spacer(1, 7 * mm)]

    body += [Paragraph(text(order.test.get_category_display()).upper(), LABEL),
             Paragraph(text(order.test.name), _style('test', fontName='Helvetica-Bold', fontSize=15, leading=19))]
    if order.instructions:
        body.append(Paragraph(text(order.instructions), _style('note', textColor=MUTED)))

    flag = {'normal': ('NORMAL', GREEN), 'abnormal': ('NEEDS ATTENTION', ROSE)}.get(order.result_flag)
    heading = Table([[Paragraph('RESULT', LABEL),
                      Paragraph(f'<b>{flag[0]}</b>', _style('flag', fontSize=8, alignment=TA_RIGHT, textColor=flag[1]))
                      if flag else '']], colWidths=[PAGE_WIDTH / 2 - 10, PAGE_WIDTH / 2 - 10])
    result = order.result if order.status == 'completed' else 'Result not ready yet.'
    box = Table([[[heading, Spacer(1, 2 * mm), Paragraph(text(result), _style('result', fontSize=11, leading=15))]]],
                colWidths=[PAGE_WIDTH])
    box.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#cbd5e1')),
                             ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                             ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 10)]))
    body += [Spacer(1, 5 * mm), box]

    reporter = order.completed_by
    body.append(_signature([f'Reported by {reporter.get_full_name() or reporter.username}' if reporter else 'Laboratory']))
    return _build('Lab report', [f'Report no. {order.pk:06d}', when(order.completed_at or order.ordered_at, False)],
                  body, f'Lab report {order.pk:06d} — {patient}')
