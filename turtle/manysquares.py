#Draw lots of squares
#Mr Reed - git hub

#Set up the turtle
import turtle
bob = turtle.Turtle()
bob.speed(7)

#Draw 6 squares
for j in range(6):    
    for i in range(4):
        bob.forward(10)
        bob.left(90)

    #Move along a bit after each square
    bob.penup()
    bob.forward(20)
    bob.pendown()
