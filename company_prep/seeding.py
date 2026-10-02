import datetime
from .models import Company, CompanyAptitudeQuestion, CompanyTechnicalQuestion

def seed_company_prep():
    if Company.objects.exists():
        return

    # 1. Create Companies with multiple years (papers)
    companies_base = [
        {
            "name": "Google",
            "package": "15 LPA",
            "job_role": "Software Engineer (L3)",
            "selection_process": "Round 1: Aptitude -> Round 2: Technical",
            "skills_required": ["DSA", "System Design", "Python", "Java", "C++", "Go", "Operating Systems", "SQL"],
            "technical_round_format": "Compiler",
            "years": [2021, 2022, 2023]
        },
        {
            "name": "Bosch",
            "package": "7.0 LPA",
            "job_role": "Embedded Software Developer",
            "selection_process": "Round 1: Aptitude -> Round 2: Technical",
            "skills_required": ["Embedded C", "RTOS", "CAN Protocol", "STM32", "Embedded Linux", "Microcontrollers", "I2C/SPI", "PWM"],
            "years": [2022, 2023]
        },
        {
            "name": "TCS",
            "package": "3.6 LPA",
            "job_role": "Ninja & Digital Developer",
            "selection_process": "Round 1: Aptitude -> Round 2: Technical",
            "skills_required": ["C", "OOP", "SQL", "Data Structures", "Java", "Python", "Communication"],
            "years": [2021, 2022, 2023]
        },
        {
            "name": "Toyota",
            "package": "8.0 LPA",
            "job_role": "Production and Quality Control Engineer",
            "selection_process": "Round 1: Aptitude -> Round 2: Technical",
            "skills_required": ["Lean Manufacturing", "Kaizen", "5S", "Six Sigma", "Quality Control", "Thermodynamics", "CAD"],
            "years": [2022, 2023]
        },
        {
            "name": "Deloitte",
            "package": "7.6 LPA",
            "job_role": "Technology Consulting Analyst",
            "selection_process": "Round 1: Aptitude -> Round 2: Technical",
            "skills_required": ["Excel", "Power BI", "SQL", "Business Cases", "Client Communication", "Tableau", "Project Management"],
            "years": [2022, 2023]
        },
        {
            "name": "Accenture",
            "package": "4.5 LPA",
            "job_role": "Associate Software Engineer",
            "selection_process": "Round 1: Aptitude -> Round 2: Technical",
            "skills_required": ["Java", "Cloud Computing", "SQL", "Networking", "Problem Solving", "Agile Methodologies"],
            "years": [2022, 2023]
        },
        {
            "name": "Cisco",
            "package": "18.0 LPA",
            "job_role": "Associate Network Engineer",
            "selection_process": "Round 1: Aptitude -> Round 2: Technical",
            "skills_required": ["Computer Networks", "TCP/IP", "C", "C++", "Python", "Routing & Switching", "Operating Systems", "DSA"],
            "years": [2022, 2023]
        }
    ]

    for base in companies_base:
        years = base.pop("years", [2023])
        for yr in years:
            Company.objects.create(
                year=yr,
                expected_interview_date=datetime.date(yr, 10, 15),
                is_published=True,
                **base
            )

    # 2. Seed Aptitude Questions (Round 1)
    aptitude_questions = [
        # Quantitative Aptitude
        {
            "topic": "Quantitative Aptitude",
            "difficulty": "Easy",
            "question_text": "If a car travels at 60 km/h, how much distance does it cover in 2.5 hours?",
            "options": ["120 km", "150 km", "180 km", "200 km"],
            "correct_answer": "150 km",
            "explanation": "Distance = Speed * Time = 60 * 2.5 = 150 km."
        },
        {
            "topic": "Quantitative Aptitude",
            "difficulty": "Easy",
            "question_text": "A can do a piece of work in 10 days and B in 15 days. How long will they take together?",
            "options": ["5 days", "6 days", "8 days", "7.5 days"],
            "correct_answer": "6 days",
            "explanation": "Combined work rate = 1/10 + 1/15 = 5/30 = 1/6. So they take 6 days."
        },
        {
            "topic": "Quantitative Aptitude",
            "difficulty": "Medium",
            "question_text": "Find the probability of getting a sum of 8 when two dice are thrown together.",
            "options": ["5/36", "1/6", "7/36", "1/12"],
            "correct_answer": "5/36",
            "explanation": "Favorable outcomes: (2,6), (3,5), (4,4), (5,3), (6,2) = 5 outcomes. Total outcomes = 36. Probability = 5/36."
        },
        {
            "topic": "Quantitative Aptitude",
            "difficulty": "Medium",
            "question_text": "A sum of money doubles itself in 8 years at simple interest. What is the rate of interest per annum?",
            "options": ["10%", "12.5%", "15%", "8%"],
            "correct_answer": "12.5%",
            "explanation": "Let Principal be P. S.I. = P. P = (P * R * 8)/100 => 8R = 100 => R = 12.5%."
        },
        {
            "topic": "Quantitative Aptitude",
            "difficulty": "Hard",
            "question_text": "A train passes a station platform in 36 seconds and a man standing on the platform in 20 seconds. If the speed of the train is 54 km/hr, what is the length of the platform?",
            "options": ["120 m", "240 m", "300 m", "180 m"],
            "correct_answer": "240 m",
            "explanation": "Speed = 54 * 5/18 = 15 m/s. Length of train = 15 * 20 = 300 m. Length of train + platform = 15 * 36 = 540 m. Platform = 540 - 300 = 240 m."
        },
        # Logical Reasoning
        {
            "topic": "Logical Reasoning",
            "difficulty": "Easy",
            "question_text": "Which number should come next in the pattern: 2, 4, 8, 16, 32, ...?",
            "options": ["48", "64", "50", "36"],
            "correct_answer": "64",
            "explanation": "Each number is multiplied by 2 to get the next term. 32 * 2 = 64."
        },
        {
            "topic": "Logical Reasoning",
            "difficulty": "Medium",
            "question_text": "Pointing to a photograph, Rohan said, 'Her mother is the only daughter of my mother.' Whose photograph is it?",
            "options": ["Rohan's mother", "Rohan's daughter", "Rohan's sister", "Rohan's wife"],
            "correct_answer": "Rohan's daughter",
            "explanation": "The 'only daughter of my mother' is Rohan's sister. Her mother is Rohan's sister... wait, Rohan says 'Her mother is the only daughter of my mother' (Rohan's sister). So the photo is of his sister's daughter, or if Rohan is female, her daughter. Assuming standard question context, it is Rohan's daughter/niece. Let's trace: 'only daughter of my mother' = Rohan's sister (if Rohan is male) or Rohan herself (if Rohan is female). Assuming Rohan is female, her mother = herself, so it is Rohan's daughter."
        },
        {
            "topic": "Logical Reasoning",
            "difficulty": "Hard",
            "question_text": "If coding is represented as 'ELENG' in a certain code, how is 'DECODE' written?",
            "options": ["FGEQFG", "BCABCB", "EGDFEG", "FGDEGF"],
            "correct_answer": "EGDFEG",
            "explanation": "The code shifts characters using a specific pattern. D(+1)->E, E(+2)->G, C(+1)->D, O(+2)->Q etc."
        },
        # Verbal Ability
        {
            "topic": "Verbal Ability",
            "difficulty": "Easy",
            "question_text": "Choose the word that is most similar in meaning to: 'CANDID'",
            "options": ["Secretive", "Frank", "Polite", "Vague"],
            "correct_answer": "Frank",
            "explanation": "Candid means truthful, straightforward, or frank."
        },
        {
            "topic": "Verbal Ability",
            "difficulty": "Medium",
            "question_text": "Identify the grammatically correct sentence.",
            "options": [
                "Either of the plans are acceptable.",
                "Either of the plans is acceptable.",
                "Either of the plan are acceptable.",
                "Each of the plans are acceptable."
            ],
            "correct_answer": "Either of the plans is acceptable.",
            "explanation": "'Either' is singular and takes a singular verb ('is')."
        },
        {
            "topic": "Verbal Ability",
            "difficulty": "Hard",
            "question_text": "Select the correct option to fill in the blank: The manager's ____ remarks did not help to clarify the complex situation.",
            "options": ["lucid", "ambiguous", "trenchant", "cogent"],
            "correct_answer": "ambiguous",
            "explanation": "Ambiguous means open to more than one interpretation or double-meaning, which explains why they did not clarify the situation."
        },
        # Data Interpretation
        {
            "topic": "Data Interpretation",
            "difficulty": "Easy",
            "question_text": "If a company's total expenditure is $500,000 and 20% of it is spent on marketing, how much is spent on marketing?",
            "options": ["$100,000", "$50,000", "$150,000", "$200,000"],
            "correct_answer": "$100,000",
            "explanation": "20% of 500,000 = 0.20 * 500,000 = $100,000."
        },
        {
            "topic": "Data Interpretation",
            "difficulty": "Medium",
            "question_text": "A pie chart shows expenditure: Rent (30%), Salaries (40%), Utilities (10%), Marketing (20%). If total expenditure is $1,200,000, what is the ratio of Rent to Marketing expenditure?",
            "options": ["2:3", "3:2", "4:3", "1:2"],
            "correct_answer": "3:2",
            "explanation": "Rent = 30%, Marketing = 20%. Ratio = 30:20 = 3:2."
        }
    ]

    for q in aptitude_questions:
        # Save for all companies by leaving company = None, so it is general!
        CompanyAptitudeQuestion.objects.create(company=None, **q)

    # 3. Seed Technical Questions (Round 2) by Branch
    technical_questions = [
        # CSE
        {
            "branch": "CSE",
            "topic": "OOP",
            "question_text": "Which of the following concepts of OOPS means exposing only necessary secrets and hiding internal implementation details?",
            "options": ["Encapsulation", "Polymorphism", "Abstraction", "Inheritance"],
            "correct_answer": "Abstraction",
            "explanation": "Abstraction is the process of hiding details and showing only essentials. Encapsulation is binding data and functions together."
        },
        {
            "branch": "CSE",
            "topic": "DSA",
            "question_text": "What is the worst-case time complexity of searching an element in a balanced Binary Search Tree (AVL tree)?",
            "options": ["O(1)", "O(n)", "O(log n)", "O(n log n)"],
            "correct_answer": "O(log n)",
            "explanation": "AVL trees are balanced. Search in a balanced BST takes O(log n) time in both average and worst cases."
        },
        {
            "branch": "CSE",
            "topic": "SQL",
            "question_text": "Which SQL statement is used to remove all records from a table without logging individual row deletions?",
            "options": ["DELETE", "DROP", "TRUNCATE", "REMOVE"],
            "correct_answer": "TRUNCATE",
            "explanation": "TRUNCATE removes all rows quickly without logging row-level deletes, whereas DELETE deletes them row-by-row."
        },
        {
            "branch": "CSE",
            "topic": "Operating Systems",
            "question_text": "What is a deadlock prevention strategy that ensures one of the four Coffman conditions cannot hold?",
            "options": ["Mutual exclusion negation", "Hold and wait negation", "Circular wait negation", "All of the above"],
            "correct_answer": "All of the above",
            "explanation": "Negating any one of the Coffman conditions (Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait) prevents deadlocks."
        },
        {
            "branch": "CSE",
            "topic": "Computer Networks",
            "question_text": "Which protocol works at the Transport layer of the OSI model and provides connection-oriented, reliable delivery?",
            "options": ["UDP", "IP", "TCP", "HTTP"],
            "correct_answer": "TCP",
            "explanation": "TCP (Transmission Control Protocol) is connection-oriented and reliable, while UDP is connectionless."
        },

        # ECE
        {
            "branch": "ECE",
            "topic": "Embedded Systems",
            "question_text": "What is the main difference between SPI and I2C communication protocols?",
            "options": [
                "SPI is full-duplex with 4 wires; I2C is half-duplex with 2 wires.",
                "SPI is half-duplex with 2 wires; I2C is full-duplex with 4 wires.",
                "SPI is asynchronous; I2C is synchronous.",
                "SPI supports multi-masters; I2C supports only single-master."
            ],
            "correct_answer": "SPI is full-duplex with 4 wires; I2C is half-duplex with 2 wires.",
            "explanation": "SPI uses MOSI, MISO, SCK, SS (4 wires, full-duplex). I2C uses SDA, SCL (2 wires, half-duplex)."
        },
        {
            "branch": "ECE",
            "topic": "Digital Electronics",
            "question_text": "How many select lines are required for a 16-to-1 Multiplexer?",
            "options": ["2", "3", "4", "5"],
            "correct_answer": "4",
            "explanation": "Number of inputs = 2^n, where n is select lines. 16 = 2^4, so 4 select lines are needed."
        },
        {
            "branch": "ECE",
            "topic": "Embedded C",
            "question_text": "What is the purpose of the 'volatile' keyword in Embedded C?",
            "options": [
                "To store variables in ROM",
                "To optimize the compilation speed",
                "To tell the compiler not to optimize the variable as it can change outside the program flow",
                "To allow the variable to be shared across multiple threads without locking"
            ],
            "correct_answer": "To tell the compiler not to optimize the variable as it can change outside the program flow",
            "explanation": "'volatile' informs the compiler that the value of the variable can change unexpectedly (e.g. via hardware registers or ISRs), preventing optimization."
        },

        # Mechanical
        {
            "branch": "Mechanical",
            "topic": "Thermodynamics",
            "question_text": "Which thermodynamic cycle consists of two isothermal and two isentropic processes?",
            "options": ["Otto Cycle", "Rankine Cycle", "Carnot Cycle", "Diesel Cycle"],
            "correct_answer": "Carnot Cycle",
            "explanation": "The Carnot cycle consists of two reversible isothermal and two reversible adiabatic (isentropic) processes."
        },
        {
            "branch": "Mechanical",
            "topic": "Manufacturing",
            "question_text": "What does Kaizen stand for in manufacturing terminology?",
            "options": ["Zero Defect Quality", "Continuous Improvement", "Just-in-Time", "Standardized Work"],
            "correct_answer": "Continuous Improvement",
            "explanation": "Kaizen is a Japanese term meaning 'change for better' or 'continuous improvement' in workplace operations."
        },

        # Civil
        {
            "branch": "Civil",
            "topic": "RCC",
            "question_text": "What is the modular ratio of concrete when the characteristic strength is known?",
            "options": ["280 / (3 * sigma_cbc)", "350 / sigma_cbc", "150 / sigma_cbc", "200 / (2 * sigma_cbc)"],
            "correct_answer": "280 / (3 * sigma_cbc)",
            "explanation": "As per IS 456, the modular ratio m is given by 280 / (3 * sigma_cbc)."
        },
        {
            "branch": "Civil",
            "topic": "Surveying",
            "question_text": "Which of the following scales is the largest?",
            "options": ["1:500", "1:1000", "1:5000", "1:10000"],
            "correct_answer": "1:500",
            "explanation": "A smaller denominator represents a larger scale (more detail on a smaller area)."
        },

        # MBA
        {
            "branch": "MBA",
            "topic": "Marketing",
            "question_text": "Which of the following describes the 4 Ps of the Marketing Mix?",
            "options": [
                "Product, Price, Place, Promotion",
                "People, Process, Profit, Packaging",
                "Product, Position, Penetration, Publicity",
                "Performance, Planning, Price, Promotion"
            ],
            "correct_answer": "Product, Price, Place, Promotion",
            "explanation": "The classic 4 Ps of marketing are Product, Price, Place, and Promotion."
        },
        {
            "branch": "MBA",
            "topic": "Finance",
            "question_text": "What is the formula for the Current Ratio of a company?",
            "options": [
                "Current Assets / Current Liabilities",
                "Current Liabilities / Current Assets",
                "(Current Assets - Inventory) / Current Liabilities",
                "Net Income / Total Revenue"
            ],
            "correct_answer": "Current Assets / Current Liabilities",
            "explanation": "Current Ratio = Current Assets divided by Current Liabilities, showing short-term liquidity."
        },
        # Coding Questions for Round 2 Compiler
        {
            "branch": "CSE",
            "topic": "Programming",
            "type": "Code",
            "question_text": "# Write a python function 'factorial(n)' that returns the factorial of n.\n# E.g. factorial(5) should return 120.\n\ndef factorial(n):\n    # Write your code here\n    pass\n\n# Test your function:\nprint(factorial(5))",
            "options": [],
            "correct_answer": "120",
            "explanation": "Factorial of n is computed as n * factorial(n-1)."
        },
        {
            "branch": "CSE",
            "topic": "Programming",
            "type": "Code",
            "question_text": "# Write a python function 'reverse_string(s)' to reverse a string.\n# E.g. reverse_string('hello') should return 'olleh'.\n\ndef reverse_string(s):\n    # Write your code here\n    pass\n\nprint(reverse_string('hello'))",
            "options": [],
            "correct_answer": "olleh",
            "explanation": "String reversal can be achieved using slicing: s[::-1]."
        },
        {
            "branch": "ECE",
            "topic": "Embedded Systems",
            "type": "Code",
            "question_text": "// Embedded C: Write code to configure dynamic PWM duty cycle to 50%\n// Complete the set_pwm_fifty() function.\n\n#include <stdio.h>\n\nvoid set_pwm_fifty() {\n    // Assuming standard hardware registers\n    int PWM_REG = 0;\n    // Write your register configuration code here\n    \n    printf(\"PWM configured to 50%%\");\n}\n\nint main() {\n    set_pwm_fifty();\n    return 0;\n}",
            "options": [],
            "correct_answer": "PWM configured to 50%",
            "explanation": "Setting PWM_REG = 128 (out of 255) yields approximately 50% duty cycle."
        },
        {
            "branch": "Mechanical",
            "topic": "CAD/CNC",
            "type": "Code",
            "question_text": "# Write a simple python script to calculate the torque of a motor\n# given Force = 100N and Radius = 0.5m. Formula: Torque = Force * Radius\n\nforce = 100\nradius = 0.5\n# Calculate and print the torque\n",
            "options": [],
            "correct_answer": "50.0",
            "explanation": "Torque = Force * Radius = 100 * 0.5 = 50.0 N-m."
        },
        {
            "branch": "Civil",
            "topic": "STAAD/AutoCAD",
            "type": "Code",
            "question_text": "# Write a python script to calculate the area of a column cross section\n# given width = 300 and depth = 450.\n\nwidth = 300\ndepth = 450\n# Calculate and print area\n",
            "options": [],
            "correct_answer": "135000",
            "explanation": "Area = width * depth = 300 * 450 = 135000 sq mm."
        },
        {
            "branch": "MBA",
            "topic": "Business Case",
            "type": "Code",
            "question_text": "# Write a python script to compute Net Profit Margin\n# given Revenue = 500000 and Net Income = 75000.\n# Formula: Margin = (Net Income / Revenue) * 100\n\nrevenue = 500000\nnet_income = 75000\n# Calculate and print margin\n",
            "options": [],
            "correct_answer": "15.0",
            "explanation": "Margin = (75000 / 500000) * 100 = 15.0%."
        }
    ]

    for q in technical_questions:
        CompanyTechnicalQuestion.objects.create(company=None, **q)

    print("Company Preparation Hub data seeded successfully!")
