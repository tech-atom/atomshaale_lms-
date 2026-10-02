#include <stdio.h>
#include <string.h>

#define MAX_STUDENTS 100

struct Student {
    char name[50];
    int marks;
};

// Cross-platform pause function (replacement for getch)
void pause() {
    printf("\nPress Enter to continue...");
    while(getchar() != '\n');  // Clear input buffer
    getchar();  // Wait for Enter
}

// Clear screen function (cross-platform)
void clearScreen() {
    #ifdef _WIN32
        system("cls");
    #else
        system("clear");
    #endif
}

int main() {
    struct Student students[MAX_STUDENTS];
    int count = 0, choice, i, total = 0, topMarks = -1;
    char topStudent[50];

    do {
        clearScreen();  // Clear screen
        printf("\n====================");
        printf("\n Student Manager");
        printf("\n====================");
        printf("\n1. Add Student");
        printf("\n2. Show All Students");
        printf("\n3. Calculate Average Marks");
        printf("\n4. Show Topper");
        printf("\n5. Exit");
        printf("\n\nEnter your choice: ");
        scanf("%d", &choice);

        switch (choice) {
            case 1:
                if (count >= MAX_STUDENTS) {
                    printf("\nCannot add more students. Maximum limit reached.\n");
                } else {
                    printf("\nEnter student name: ");
                    scanf("%s", students[count].name);
                    printf("Enter marks: ");
                    scanf("%d", &students[count].marks);
                    count++;
                    printf("\nStudent added successfully!");
                }
                pause();
                break;

            case 2:
                printf("\n--- All Students ---\n");
                for (i = 0; i < count; i++) {
                    printf("Name: %s, Marks: %d\n", students[i].name, students[i].marks);
                }
                if (count == 0)
                    printf("\nNo students to display.");
                pause();
                break;

            case 3:
                if (count == 0) {
                    printf("\nNo data to calculate average.\n");
                } else {
                    total = 0;
                    for (i = 0; i < count; i++) {
                        total += students[i].marks;
                    }
                    printf("\nAverage Marks: %.2f\n", (float)total / count);
                }
                pause();
                break;

            case 4:
                if (count == 0) {
                    printf("\nNo data to find topper.\n");
                } else {
                    topMarks = students[0].marks;
                    strcpy(topStudent, students[0].name);
                    for (i = 1; i < count; i++) {
                        if (students[i].marks > topMarks) {
                            topMarks = students[i].marks;
                            strcpy(topStudent, students[i].name);
                        }
                    }
                    printf("\nTopper: %s with %d marks\n", topStudent, topMarks);
                }
                pause();
                break;

            case 5:
                printf("\nExiting the program...\n");
                break;

            default:
                printf("\nInvalid choice. Try again.");
                pause();
        }
    } while (choice != 5);

    return 0;
}
