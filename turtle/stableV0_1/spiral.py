#Spiral time!
#Mr Reed - git hub

#Initialise the turtle
import turtle
bob = turtle.Turtle()
bob.speed(7)

dist = 5
for i in range(100):
    bob.forward(dist)
    bob.left(90)
    
    #make the line longer each time inside the loop
    dist = dist + 5
