import requests
import json

# Test C code
c_code = '''#include <stdio.h>

int main() {
    int marks[5] = {85, 72, 90, 66, 95};
    char *names[5] = {"Alice", "Bob", "Charlie", "David", "Eva"};
    int sum = 0;
    float average;
    int i;

    printf("Student Report\\n\\n");

    for(i = 0; i < 5; i++) {
        sum += marks[i];

        char grade;
        if(marks[i] >= 90)
            grade = 'A';
        else if(marks[i] >= 80)
            grade = 'B';
        else if(marks[i] >= 70)
            grade = 'C';
        else if(marks[i] >= 60)
            grade = 'D';
        else
            grade = 'F';

        printf("%s scored %d marks and got grade %c\\n", names[i], marks[i], grade);
    }

    average = sum / 5.0;
    printf("\\nClass Average Marks: %.2f\\n", average);

    int topIndex = 0;
    for(i = 1; i < 5; i++) {
        if(marks[i] > marks[topIndex]) {
            topIndex = i;
        }
    }
    printf("Top Student: %s with %d marks\\n", names[topIndex], marks[topIndex]);

    return 0;
}'''

# Test Java code
java_code = '''public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        System.out.println("Java is working!");
    }
}'''

print("Testing C code compilation...")
print("="*60)
response = requests.post('http://127.0.0.1:8000/compile/', 
                        json={'code': c_code, 'language': 'c'})
result = response.json()
print(f"Success: {result.get('success')}")
print(f"Output:\n{result.get('output', '')}")
if result.get('error'):
    print(f"Error:\n{result.get('error')}")

print("\n" + "="*60)
print("Testing Java code compilation...")
print("="*60)
response = requests.post('http://127.0.0.1:8000/compile/', 
                        json={'code': java_code, 'language': 'java'})
result = response.json()
print(f"Success: {result.get('success')}")
print(f"Output:\n{result.get('output', '')}")
if result.get('error'):
    print(f"Error:\n{result.get('error')}")
