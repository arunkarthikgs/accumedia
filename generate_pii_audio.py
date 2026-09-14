from gtts import gTTS
import os

clinical_pii_script = """
Clinical intake dictation. Date of encounter: 14th September 2026. 

Patient identification: 
Full legal name: Rajesh Kumar Sharma. 
Date of birth: 18th July 1968. Age: 58 years old. Gender: Male. 
National Identity Aadhaar Number: 4589 1234 8765. 
ABHA Health ID: 91-8765-4321-0987. 
Primary phone number: +91 98450 12345. 
Email address: rajesh.sharma68@gmail.com. 
Residential address: Flat 402, Shanti Nilayam Apartments, 14th Main, 5th Cross, Indiranagar, Bangalore, Karnataka, 560038. 
Emergency contact: Sunita Sharma, spouse, reachable at +91 98450 98765. 
Employer: TechCorp Solutions Private Limited, Electronic City Phase 1. 

Attending Physician: Dr. Vikramaditya Rao, NMC Registration Number 54321, Department of Internal Medicine.

Clinical narrative:
Patient presents to the outpatient clinic with complaints of severe epigastric burning pain radiating to the back for the past four days, accompanied by nausea and two episodes of bilious vomiting. 

Past medical history: Essential hypertension diagnosed five years ago, managed on Amlodipine 5 milligrams once daily. Type 2 diabetes mellitus on Metformin 500 milligrams twice daily. Patient admits to binge alcohol consumption over the weekend prior to symptom onset. No known drug allergies.

Physical Examination: 
Blood pressure: 142 over 88 millimeters of mercury. Heart rate: 96 beats per minute, regular. Respiratory rate: 18 breaths per minute. Temperature: 98.6 degrees Fahrenheit. Oxygen saturation: 98 percent on ambient air. 
Epigastric tenderness present on deep palpation with voluntary guarding. No rebound tenderness.

Investigations: 
Complete blood count reveals mild leukocytosis. Serum lipase is significantly elevated at 480 units per liter. Serum amylase is 210 units per liter. Abdominal ultrasound shows diffuse pancreatic edema consistent with acute mild pancreatitis.

Assessment and plan:
Acute mild interstitial pancreatitis, alcohol-induced, with underlying hypertension and diabetes mellitus. 
Admit to step-down ward. Nil per oral for twelve hours, start intravenous Ringer's Lactate at 150 milliliters per hour. 
Injection Pantoprazole 40 milligrams IV daily. Injection Tramadol 50 milligrams IV as needed for acute pain control. 
Send billing invoice to corporate health insurance policy number ICICI-LOMBARD-7789012. 
Counsel patient regarding strict alcohol cessation.
"""

print("Generating audio with PII tokens...")
tts = gTTS(text=clinical_pii_script, lang="en", tld="co.in", slow=False)
output_filename = "clinical_case_pii_test.mp3"
tts.save(output_filename)
print(f"File generated successfully: {output_filename}")
