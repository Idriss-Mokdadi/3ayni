"""Final touches after tplpolish.py: one size for the problem bullets and a
one-line title on the Tests and Validation slide. Run: python finish.py"""
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Pt

DECK = '3ayni-pitch.pptx'
deck = Presentation(DECK)

# Slide 2: every bullet at the same size.
for shape in deck.slides[1].shapes:
    if shape.name.startswith('bullets-'):
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                run.font.size = Pt(13)

# Slide 7: title on one line above the first number.
for shape in deck.slides[6].shapes:
    if shape.name == '!!title':
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                run.font.size = Pt(24)
                run.font.color.rgb = RGBColor(0x74, 0xE3, 0xFF)  # template title cyan

deck.save(DECK)
print('finished', DECK)
